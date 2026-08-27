import { stableHash } from "./index.js";
import {
  FileProjectStore,
  StoreConflictError,
  type StoredEnvelope,
} from "./project-store.js";
import {
  STORY_TRUTH_SCHEMA_VERSION,
  storyTruthPublicView,
  verifyStoryTruthLedger,
  type StoryTruthLedger,
  type StoryTruthPublicView,
} from "./story-truth-ledger.js";

export const STORY_TRUTH_STORE_ENTITY_TYPE = "story-bible" as const;

export interface StoryTruthStoreSaveOptions {
  expectedRevision: number;
  actorId: string;
  action?: string;
  now?: Date;
}

export class StoryTruthStoreConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoryTruthStoreConflictError";
  }
}

export class StoryTruthStoreIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoryTruthStoreIntegrityError";
  }
}

function storyTruthEntityId(ledgerId: string): string {
  if (typeof ledgerId !== "string" || ledgerId.trim().length === 0) {
    throw new Error("STORY_TRUTH_STORE_LEDGER_ID_REQUIRED");
  }
  return `story_truth_${stableHash({ ledgerId }).slice(0, 32)}`;
}

function assertLedgerIntegrity(ledger: StoryTruthLedger, expectedLedgerId?: string): void {
  if (ledger.schemaVersion !== STORY_TRUTH_SCHEMA_VERSION) {
    throw new StoryTruthStoreIntegrityError("STORY_TRUTH_STORE_SCHEMA_UNSUPPORTED");
  }
  if (expectedLedgerId !== undefined && ledger.id !== expectedLedgerId) {
    throw new StoryTruthStoreIntegrityError("STORY_TRUTH_STORE_LEDGER_ID_MISMATCH");
  }
  let validation;
  try {
    validation = verifyStoryTruthLedger(ledger);
  } catch {
    throw new StoryTruthStoreIntegrityError("STORY_TRUTH_STORE_STRUCTURE_INVALID");
  }
  if (!validation.ok) {
    const codes = [...new Set(validation.findings
      .filter((finding) => finding.severity === "error")
      .map((finding) => finding.code))];
    throw new StoryTruthStoreIntegrityError(
      `STORY_TRUTH_STORE_LEDGER_INVALID:${codes.join(",") || "UNKNOWN"}`,
    );
  }
}

function auditMetadata(ledger: StoryTruthLedger): Readonly<Record<string, string | number | boolean | null>> {
  const view = storyTruthPublicView(ledger);
  return Object.freeze({
    ledgerRevision: view.revision,
    manuscriptCount: view.manuscriptCount,
    entityCount: view.entityCount,
    eventCount: view.eventCount,
    factCount: view.factCount,
    retconCount: view.retconCount,
    contradictionCount: view.contradictionCount,
    fingerprint: view.fingerprint,
  });
}

function typedEnvelope(
  envelope: StoredEnvelope<Record<string, unknown>>,
): StoredEnvelope<StoryTruthLedger> {
  return envelope as unknown as StoredEnvelope<StoryTruthLedger>;
}

export class FileStoryTruthStore {
  readonly #store: FileProjectStore;

  constructor(store: FileProjectStore) {
    this.#store = store;
  }

  async create(
    ledger: StoryTruthLedger,
    input: Readonly<{ actorId: string; now?: Date }>,
  ): Promise<StoredEnvelope<StoryTruthLedger>> {
    assertLedgerIntegrity(ledger);
    const now = input.now ?? new Date();
    try {
      const envelope = await this.#store.create(
        STORY_TRUTH_STORE_ENTITY_TYPE,
        storyTruthEntityId(ledger.id),
        ledger as unknown as Record<string, unknown>,
        now,
      );
      const typed = typedEnvelope(envelope);
      await this.#store.appendAuditEvent({
        actorId: input.actorId,
        action: "story_truth.created",
        entityType: STORY_TRUTH_STORE_ENTITY_TYPE,
        entityId: typed.entityId,
        revision: typed.revision,
        metadata: auditMetadata(ledger),
        occurredAt: now,
      });
      return typed;
    } catch (error) {
      if (error instanceof StoreConflictError) {
        throw new StoryTruthStoreConflictError(error.message);
      }
      throw error;
    }
  }

  async read(ledgerId: string): Promise<StoredEnvelope<StoryTruthLedger> | null> {
    const envelope = await this.#store.read<Record<string, unknown>>(
      STORY_TRUTH_STORE_ENTITY_TYPE,
      storyTruthEntityId(ledgerId),
    );
    if (!envelope) return null;
    const typed = typedEnvelope(envelope);
    assertLedgerIntegrity(typed.payload, ledgerId);
    return typed;
  }

  async require(ledgerId: string): Promise<StoredEnvelope<StoryTruthLedger>> {
    const envelope = await this.read(ledgerId);
    if (!envelope) throw new StoryTruthStoreConflictError("STORY_TRUTH_STORE_LEDGER_NOT_FOUND");
    return envelope;
  }

  async save(
    ledger: StoryTruthLedger,
    options: StoryTruthStoreSaveOptions,
  ): Promise<StoredEnvelope<StoryTruthLedger>> {
    assertLedgerIntegrity(ledger);
    if (!Number.isSafeInteger(options.expectedRevision) || options.expectedRevision < 1) {
      throw new Error("STORY_TRUTH_STORE_EXPECTED_REVISION_INVALID");
    }
    if (ledger.revision !== options.expectedRevision + 1) {
      throw new StoryTruthStoreConflictError("STORY_TRUTH_STORE_LEDGER_REVISION_MISMATCH");
    }
    const now = options.now ?? new Date();
    try {
      const envelope = await this.#store.replace(
        STORY_TRUTH_STORE_ENTITY_TYPE,
        storyTruthEntityId(ledger.id),
        options.expectedRevision,
        ledger as unknown as Record<string, unknown>,
        now,
      );
      const typed = typedEnvelope(envelope);
      await this.#store.appendAuditEvent({
        actorId: options.actorId,
        action: options.action ?? "story_truth.revised",
        entityType: STORY_TRUTH_STORE_ENTITY_TYPE,
        entityId: typed.entityId,
        revision: typed.revision,
        metadata: auditMetadata(ledger),
        occurredAt: now,
      });
      return typed;
    } catch (error) {
      if (error instanceof StoreConflictError) {
        throw new StoryTruthStoreConflictError(error.message);
      }
      throw error;
    }
  }

  async list(): Promise<readonly StoredEnvelope<StoryTruthLedger>[]> {
    const rows = await this.#store.list(STORY_TRUTH_STORE_ENTITY_TYPE);
    const ledgers: StoredEnvelope<StoryTruthLedger>[] = [];
    for (const row of rows) {
      if (!row.entityId.startsWith("story_truth_")) continue;
      const envelope = await this.#store.read<Record<string, unknown>>(
        STORY_TRUTH_STORE_ENTITY_TYPE,
        row.entityId,
      );
      if (!envelope || envelope.payload.schemaVersion !== STORY_TRUTH_SCHEMA_VERSION) continue;
      const typed = typedEnvelope(envelope);
      assertLedgerIntegrity(typed.payload);
      ledgers.push(typed);
    }
    return Object.freeze(ledgers.sort((left, right) =>
      left.payload.id.localeCompare(right.payload.id, "en-AU")
    ));
  }

  async publicView(ledgerId: string): Promise<StoryTruthPublicView | null> {
    const envelope = await this.read(ledgerId);
    return envelope ? storyTruthPublicView(envelope.payload) : null;
  }
}
