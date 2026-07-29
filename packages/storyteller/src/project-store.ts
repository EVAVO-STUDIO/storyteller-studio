import { appendFile, mkdir, open, readFile, readdir, rename, rm } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { stableHash } from "./index.js";

export type StoredEntityType =
  | "artifact"
  | "budget-account"
  | "calibration-session"
  | "generation-material"
  | "project"
  | "series"
  | "manuscript-revision"
  | "story-bible"
  | "voice-profile"
  | "continuity-anchor"
  | "performance-plan"
  | "generation-job"
  | "take-assessment"
  | "mastered-chapter-review"
  | "book-chapter-sequence"
  | "book-credit-script"
  | "book-credit-generation"
  | "book-credit-take"
  | "book-credit-take-review"
  | "audiobook-sequence"
  | "audiobook-reference-master-review"
  | "audiobook-retail-track-review"
  | "audiobook-retail-sample-plan"
  | "audiobook-retail-sample-review"
  | "audiobook-retail-package-manifest"
  | "audiobook-retail-package-inspection"
  | "audiobook-retail-package-review"
  | "audiobook-retail-release-decision"
  | "audiobook-retail-delivery-attempt"
  | "audiobook-retail-submission-review"
  | "audiobook-retail-submission-decision"
  | "audiobook-retail-submission-attempt"
  | "audiobook-retailer-status-evidence"
  | "audiobook-retail-listing-identity"
  | "audiobook-retail-publication-verification"
  | "chapter-assembly"
  | "release-package";

export interface StoredEnvelope<T> {
  schemaVersion: "storyteller-store-v1";
  entityType: StoredEntityType;
  entityId: string;
  revision: number;
  createdAt: string;
  savedAt: string;
  contentHash: string;
  previousEnvelopeHash?: string;
  envelopeHash: string;
  payload: T;
}

export interface StoreAuditEvent {
  schemaVersion: "storyteller-audit-v1";
  id: string;
  occurredAt: string;
  actorId: string;
  action: string;
  entityType: StoredEntityType;
  entityId: string;
  revision?: number;
  requestId?: string;
  metadata: Readonly<Record<string, string | number | boolean | null>>;
  fingerprint: string;
}

export class StoreConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoreConflictError";
  }
}

export class StoreIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoreIntegrityError";
  }
}

const SAFE_IDENTIFIER = /^[a-zA-Z0-9][a-zA-Z0-9._-]{1,127}$/u;
const SAFE_ACTION = /^[a-z][a-z0-9._-]{1,95}$/u;
const SAFE_METADATA_KEY = /^[a-zA-Z][a-zA-Z0-9._-]{0,63}$/u;
const MAX_METADATA_ENTRIES = 40;
const MAX_METADATA_STRING_LENGTH = 500;

function validateIdentifier(value: string, label: string): void {
  if (!SAFE_IDENTIFIER.test(value)) throw new Error(`STORE_${label.toLocaleUpperCase("en-AU")}_INVALID`);
}

function assertPlainObject(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("STORE_PAYLOAD_OBJECT_REQUIRED");
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new Error("STORE_PAYLOAD_PLAIN_OBJECT_REQUIRED");
}

function assertJsonSafe(value: unknown, seen = new Set<unknown>(), depth = 0): void {
  if (depth > 40) throw new Error("STORE_PAYLOAD_DEPTH_EXCEEDED");
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("STORE_PAYLOAD_NUMBER_INVALID");
    return;
  }
  if (typeof value === "bigint" || typeof value === "function" || typeof value === "symbol" || typeof value === "undefined") {
    throw new Error("STORE_PAYLOAD_VALUE_UNSUPPORTED");
  }
  if (seen.has(value)) throw new Error("STORE_PAYLOAD_CYCLE_DETECTED");
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) assertJsonSafe(item, seen, depth + 1);
  } else {
    assertPlainObject(value);
    for (const [key, nested] of Object.entries(value)) {
      if (key.length === 0 || key.length > 200) throw new Error("STORE_PAYLOAD_KEY_INVALID");
      assertJsonSafe(nested, seen, depth + 1);
    }
  }
  seen.delete(value);
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

function errorCode(error: unknown): string | undefined {
  return error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : undefined;
}

function canonicalEnvelopeHash<T>(envelope: Omit<StoredEnvelope<T>, "envelopeHash">): string {
  return stableHash({
    schemaVersion: envelope.schemaVersion,
    entityType: envelope.entityType,
    entityId: envelope.entityId,
    revision: envelope.revision,
    createdAt: envelope.createdAt,
    savedAt: envelope.savedAt,
    contentHash: envelope.contentHash,
    previousEnvelopeHash: envelope.previousEnvelopeHash ?? null,
    payload: envelope.payload,
  });
}

function sanitiseMetadata(input: Readonly<Record<string, string | number | boolean | null>>): Readonly<Record<string, string | number | boolean | null>> {
  const entries = Object.entries(input);
  if (entries.length > MAX_METADATA_ENTRIES) throw new Error("STORE_AUDIT_METADATA_TOO_LARGE");
  const output: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of entries) {
    if (!SAFE_METADATA_KEY.test(key)) throw new Error("STORE_AUDIT_METADATA_KEY_INVALID");
    if (typeof value === "string" && value.length > MAX_METADATA_STRING_LENGTH) throw new Error("STORE_AUDIT_METADATA_VALUE_TOO_LARGE");
    if (typeof value === "number" && !Number.isFinite(value)) throw new Error("STORE_AUDIT_METADATA_NUMBER_INVALID");
    output[key] = value;
  }
  return Object.freeze(output);
}

export class FileProjectStore {
  readonly #root: string;
  readonly #entitiesRoot: string;
  readonly #auditRoot: string;
  readonly #lockTimeoutMs: number;

  constructor(rootDirectory: string, options: { lockTimeoutMs?: number } = {}) {
    if (!rootDirectory.trim()) throw new Error("STORE_ROOT_REQUIRED");
    this.#root = resolve(rootDirectory);
    this.#entitiesRoot = join(this.#root, "entities");
    this.#auditRoot = join(this.#root, "audit");
    this.#lockTimeoutMs = options.lockTimeoutMs ?? 8_000;
    if (!Number.isSafeInteger(this.#lockTimeoutMs) || this.#lockTimeoutMs < 250 || this.#lockTimeoutMs > 60_000) {
      throw new Error("STORE_LOCK_TIMEOUT_INVALID");
    }
  }

  async initialise(): Promise<void> {
    await mkdir(this.#entitiesRoot, { recursive: true, mode: 0o700 });
    await mkdir(this.#auditRoot, { recursive: true, mode: 0o700 });
  }

  async create<T extends Record<string, unknown>>(entityType: StoredEntityType, entityId: string, payload: T, now = new Date()): Promise<StoredEnvelope<T>> {
    await this.initialise();
    this.#validateEntity(entityType, entityId);
    assertJsonSafe(payload);
    const release = await this.#acquireLock(this.#lockPath(entityType, entityId));
    try {
      const existing = await this.#readUnchecked<T>(entityType, entityId);
      if (existing) throw new StoreConflictError("STORE_ENTITY_ALREADY_EXISTS");
      const instant = now.toISOString();
      const partial: Omit<StoredEnvelope<T>, "envelopeHash"> = {
        schemaVersion: "storyteller-store-v1",
        entityType,
        entityId,
        revision: 1,
        createdAt: instant,
        savedAt: instant,
        contentHash: stableHash(payload),
        payload,
      };
      const envelope = { ...partial, envelopeHash: canonicalEnvelopeHash(partial) };
      await this.#writeAtomic(this.#entityPath(entityType, entityId), envelope);
      return envelope;
    } finally {
      await release();
    }
  }

  async replace<T extends Record<string, unknown>>(
    entityType: StoredEntityType,
    entityId: string,
    expectedRevision: number,
    payload: T,
    now = new Date(),
  ): Promise<StoredEnvelope<T>> {
    await this.initialise();
    this.#validateEntity(entityType, entityId);
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) throw new Error("STORE_EXPECTED_REVISION_INVALID");
    assertJsonSafe(payload);
    const release = await this.#acquireLock(this.#lockPath(entityType, entityId));
    try {
      const existing = await this.#readUnchecked<T>(entityType, entityId);
      if (!existing) throw new StoreConflictError("STORE_ENTITY_NOT_FOUND");
      this.#verifyEnvelope(existing);
      if (existing.revision !== expectedRevision) throw new StoreConflictError(`STORE_REVISION_CONFLICT:${existing.revision}`);
      const partial: Omit<StoredEnvelope<T>, "envelopeHash"> = {
        schemaVersion: "storyteller-store-v1",
        entityType,
        entityId,
        revision: existing.revision + 1,
        createdAt: existing.createdAt,
        savedAt: now.toISOString(),
        contentHash: stableHash(payload),
        previousEnvelopeHash: existing.envelopeHash,
        payload,
      };
      const envelope = { ...partial, envelopeHash: canonicalEnvelopeHash(partial) };
      await this.#writeAtomic(this.#entityPath(entityType, entityId), envelope);
      return envelope;
    } finally {
      await release();
    }
  }

  async read<T extends Record<string, unknown>>(entityType: StoredEntityType, entityId: string): Promise<StoredEnvelope<T> | null> {
    await this.initialise();
    this.#validateEntity(entityType, entityId);
    const envelope = await this.#readUnchecked<T>(entityType, entityId);
    if (!envelope) return null;
    this.#verifyEnvelope(envelope);
    return envelope;
  }

  async list(entityType: StoredEntityType): Promise<readonly Readonly<{ entityId: string; revision: number; contentHash: string; savedAt: string }>[]> {
    await this.initialise();
    validateIdentifier(entityType, "ENTITY_TYPE");
    const directory = this.#entityDirectory(entityType);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const names = await readdir(directory, { withFileTypes: true });
    const rows: Array<{ entityId: string; revision: number; contentHash: string; savedAt: string }> = [];
    for (const entry of names) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const entityId = entry.name.slice(0, -5);
      if (!SAFE_IDENTIFIER.test(entityId)) continue;
      const envelope = await this.read<Record<string, unknown>>(entityType, entityId);
      if (envelope) rows.push({ entityId, revision: envelope.revision, contentHash: envelope.contentHash, savedAt: envelope.savedAt });
    }
    return rows.sort((left, right) => left.entityId.localeCompare(right.entityId, "en-AU"));
  }

  async appendAuditEvent(input: Readonly<{
    actorId: string;
    action: string;
    entityType: StoredEntityType;
    entityId: string;
    revision?: number;
    requestId?: string;
    metadata?: Readonly<Record<string, string | number | boolean | null>>;
    occurredAt?: Date;
  }>): Promise<StoreAuditEvent> {
    await this.initialise();
    validateIdentifier(input.actorId, "ACTOR_ID");
    this.#validateEntity(input.entityType, input.entityId);
    if (!SAFE_ACTION.test(input.action)) throw new Error("STORE_AUDIT_ACTION_INVALID");
    if (input.revision !== undefined && (!Number.isSafeInteger(input.revision) || input.revision < 1)) throw new Error("STORE_AUDIT_REVISION_INVALID");
    if (input.requestId !== undefined) validateIdentifier(input.requestId, "REQUEST_ID");
    const metadata = sanitiseMetadata(input.metadata ?? {});
    const occurredAt = (input.occurredAt ?? new Date()).toISOString();
    const eventBase = {
      schemaVersion: "storyteller-audit-v1" as const,
      occurredAt,
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      ...(input.revision !== undefined ? { revision: input.revision } : {}),
      ...(input.requestId !== undefined ? { requestId: input.requestId } : {}),
      metadata,
    };
    const fingerprint = stableHash(eventBase);
    const event: StoreAuditEvent = { ...eventBase, id: `audit_${fingerprint.slice(0, 24)}`, fingerprint };
    const path = join(this.#auditRoot, `${occurredAt.slice(0, 10)}.jsonl`);
    const release = await this.#acquireLock(`${path}.lock`);
    try {
      await appendFile(path, `${JSON.stringify(event)}\n`, { encoding: "utf8", mode: 0o600 });
    } finally {
      await release();
    }
    return event;
  }

  #validateEntity(entityType: StoredEntityType, entityId: string): void {
    validateIdentifier(entityType, "ENTITY_TYPE");
    validateIdentifier(entityId, "ENTITY_ID");
  }

  #entityDirectory(entityType: StoredEntityType): string {
    const path = resolve(this.#entitiesRoot, entityType);
    this.#assertContained(path, this.#entitiesRoot);
    return path;
  }

  #entityPath(entityType: StoredEntityType, entityId: string): string {
    const path = resolve(this.#entityDirectory(entityType), `${entityId}.json`);
    this.#assertContained(path, this.#entityDirectory(entityType));
    return path;
  }

  #lockPath(entityType: StoredEntityType, entityId: string): string {
    return `${this.#entityPath(entityType, entityId)}.lock`;
  }

  #assertContained(path: string, parent: string): void {
    const normalisedParent = parent.endsWith(sep) ? parent : `${parent}${sep}`;
    if (path !== parent && !path.startsWith(normalisedParent)) throw new Error("STORE_PATH_ESCAPE_DETECTED");
  }

  async #readUnchecked<T extends Record<string, unknown>>(entityType: StoredEntityType, entityId: string): Promise<StoredEnvelope<T> | null> {
    try {
      const source = await readFile(this.#entityPath(entityType, entityId), "utf8");
      return JSON.parse(source) as StoredEnvelope<T>;
    } catch (error) {
      if (errorCode(error) === "ENOENT") return null;
      if (error instanceof SyntaxError) throw new StoreIntegrityError("STORE_ENTITY_JSON_INVALID");
      throw error;
    }
  }

  #verifyEnvelope<T extends Record<string, unknown>>(envelope: StoredEnvelope<T>): void {
    if (envelope.schemaVersion !== "storyteller-store-v1") throw new StoreIntegrityError("STORE_SCHEMA_UNSUPPORTED");
    this.#validateEntity(envelope.entityType, envelope.entityId);
    if (!Number.isSafeInteger(envelope.revision) || envelope.revision < 1) throw new StoreIntegrityError("STORE_REVISION_INVALID");
    assertJsonSafe(envelope.payload);
    if (stableHash(envelope.payload) !== envelope.contentHash) throw new StoreIntegrityError("STORE_CONTENT_HASH_MISMATCH");
    const { envelopeHash, ...partial } = envelope;
    if (canonicalEnvelopeHash(partial) !== envelopeHash) throw new StoreIntegrityError("STORE_ENVELOPE_HASH_MISMATCH");
  }

  async #writeAtomic<T extends Record<string, unknown>>(path: string, envelope: StoredEnvelope<T>): Promise<void> {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const temporary = `${path}.${process.pid}.${stableHash({ path, envelopeHash: envelope.envelopeHash }).slice(0, 12)}.tmp`;
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(envelope, null, 2)}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await rename(temporary, path);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }

  async #acquireLock(path: string): Promise<() => Promise<void>> {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const startedAt = Date.now();
    while (true) {
      try {
        const handle = await open(path, "wx", 0o600);
        return async () => {
          await handle.close();
          await rm(path, { force: true });
        };
      } catch (error) {
        if (errorCode(error) !== "EEXIST") throw error;
        if (Date.now() - startedAt >= this.#lockTimeoutMs) throw new StoreConflictError("STORE_LOCK_TIMEOUT");
        await sleep(20 + Math.floor(Math.random() * 30));
      }
    }
  }
}
