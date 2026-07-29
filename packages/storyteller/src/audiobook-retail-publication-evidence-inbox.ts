import {
  assertAudiobookRetailPublicationMonitor,
  type AudiobookRetailPublicationMonitor,
} from "./audiobook-retail-publication-monitor.js";
import {
  assertAudiobookRetailPublicationVerification,
  type AudiobookRetailPublicationVerification,
  type AudiobookRetailPublicationVerificationStatus,
} from "./audiobook-retail-publication-verification.js";
import { stableHash } from "./index.js";
import {
  FileProjectStore,
  StoreConflictError,
  type StoredEnvelope,
} from "./project-store.js";

export const AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_REQUEST_SCHEMA_VERSION =
  "storyteller-audiobook-retail-publication-evidence-request-v1" as const;
export const AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_INBOX_SCHEMA_VERSION =
  "storyteller-audiobook-retail-publication-evidence-inbox-v1" as const;
export const AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_INBOX_ENTITY_TYPE =
  "audiobook-retail-publication-evidence-inbox" as const;

export interface AudiobookRetailPublicationEvidenceRequest {
  schemaVersion:
    typeof AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_REQUEST_SCHEMA_VERSION;
  id: string;
  projectId: string;
  bookId: string;
  monitor: Readonly<{
    id: string;
    revision: number;
    fingerprint: string;
    listingIdentityId: string;
    listingIdentityFingerprint: string;
    latestVerificationFingerprint: string;
    lastVerifiedAt: string;
    nextRefreshDueAt: string;
  }>;
  requiredRegions: readonly string[];
  requestFingerprint: string;
  requestedAt: string;
  fingerprint: string;
}

export interface AudiobookRetailPublicationEvidenceAcknowledgement {
  monitorRevision: number;
  monitorFingerprint: string;
  verificationFingerprint: string;
  acknowledgedByActorId: string;
  acknowledgedAt: string;
  fingerprint: string;
}

export type AudiobookRetailPublicationEvidenceInboxStatus =
  | "available"
  | "acknowledged";

export interface AudiobookRetailPublicationEvidenceInboxItem {
  schemaVersion:
    typeof AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_INBOX_SCHEMA_VERSION;
  id: string;
  projectId: string;
  bookId: string;
  request: AudiobookRetailPublicationEvidenceRequest;
  verification: AudiobookRetailPublicationVerification;
  sourceReferenceHash: string;
  receivedByActorId: string;
  receivedAt: string;
  acknowledgement?: AudiobookRetailPublicationEvidenceAcknowledgement;
  status: AudiobookRetailPublicationEvidenceInboxStatus;
  revision: number;
  previousFingerprint?: string;
  updatedAt: string;
  fingerprint: string;
}

export interface AudiobookRetailPublicationEvidenceInboxPublicView {
  id: string;
  bookId: string;
  monitorId: string;
  expectedMonitorRevision: number;
  requiredRegions: readonly string[];
  verificationStatus: AudiobookRetailPublicationVerificationStatus;
  verificationVerifiedAt: string;
  observationExpiresAt: string;
  status: AudiobookRetailPublicationEvidenceInboxStatus;
  receivedAt: string;
  acknowledgedAt?: string;
  revision: number;
  updatedAt: string;
  fingerprint: string;
}

export class AudiobookRetailPublicationEvidenceInboxError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "AudiobookRetailPublicationEvidenceInboxError";
    this.code = code;
  }
}

export class AudiobookRetailPublicationEvidenceInboxStoreConflictError
  extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AudiobookRetailPublicationEvidenceInboxStoreConflictError";
  }
}

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const REGION_PATTERN = /^[A-Z]{2}$/u;
const MAXIMUM_REGIONS = 32;

function requireIdentifier(value: string, code: string): string {
  if (!SAFE_IDENTIFIER.test(value)) {
    throw new AudiobookRetailPublicationEvidenceInboxError(code);
  }
  return value;
}

function requireHash(value: string, code: string): string {
  if (!HASH_PATTERN.test(value)) {
    throw new AudiobookRetailPublicationEvidenceInboxError(code);
  }
  return value;
}

function requireDate(value: string, code: string): string {
  if (!value || Number.isNaN(Date.parse(value))) {
    throw new AudiobookRetailPublicationEvidenceInboxError(code);
  }
  return value;
}

function requireInteger(
  value: number,
  minimum: number,
  maximum: number,
  code: string,
): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new AudiobookRetailPublicationEvidenceInboxError(code);
  }
  return value;
}

function normaliseRegions(values: readonly string[]): readonly string[] {
  if (
    !Array.isArray(values)
    || values.length === 0
    || values.length > MAXIMUM_REGIONS
  ) {
    throw new AudiobookRetailPublicationEvidenceInboxError(
      "AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_REGIONS_INVALID",
    );
  }
  const regions = new Set<string>();
  for (const value of values) {
    if (!REGION_PATTERN.test(value) || regions.has(value)) {
      throw new AudiobookRetailPublicationEvidenceInboxError(
        "AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_REGIONS_INVALID",
      );
    }
    regions.add(value);
  }
  return Object.freeze(
    [...regions].sort((left, right) => left.localeCompare(right, "en-AU")),
  );
}

function requestSeed(
  monitor: AudiobookRetailPublicationMonitor,
): Readonly<{
  monitorId: string;
  monitorRevision: number;
  monitorFingerprint: string;
  latestVerificationFingerprint: string;
  nextRefreshDueAt: string;
}> {
  assertAudiobookRetailPublicationMonitor(monitor);
  return Object.freeze({
    monitorId: monitor.id,
    monitorRevision: monitor.revision,
    monitorFingerprint: monitor.fingerprint,
    latestVerificationFingerprint:
      monitor.entries.at(-1)!.verificationFingerprint,
    nextRefreshDueAt: monitor.nextRefreshDueAt,
  });
}

export function audiobookRetailPublicationRefreshRequestFingerprint(
  monitor: AudiobookRetailPublicationMonitor,
): string {
  return stableHash(requestSeed(monitor));
}

function requestFingerprint(
  value: Omit<AudiobookRetailPublicationEvidenceRequest, "fingerprint">,
): string {
  return stableHash(value);
}

function acknowledgementFingerprint(
  value: Omit<
    AudiobookRetailPublicationEvidenceAcknowledgement,
    "fingerprint"
  >,
): string {
  return stableHash(value);
}

function inboxItemFingerprint(
  value: Omit<AudiobookRetailPublicationEvidenceInboxItem, "fingerprint">,
): string {
  return stableHash(value);
}

export function createAudiobookRetailPublicationEvidenceRequest(
  monitor: AudiobookRetailPublicationMonitor,
  requestedAt = new Date(),
): AudiobookRetailPublicationEvidenceRequest {
  assertAudiobookRetailPublicationMonitor(monitor);
  if (
    Number.isNaN(requestedAt.getTime())
    || requestedAt.getTime() < Date.parse(monitor.updatedAt)
  ) {
    throw new AudiobookRetailPublicationEvidenceInboxError(
      "AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_REQUEST_DATE_INVALID",
    );
  }
  const requestHash = audiobookRetailPublicationRefreshRequestFingerprint(monitor);
  const partial: Omit<
    AudiobookRetailPublicationEvidenceRequest,
    "fingerprint"
  > = {
    schemaVersion:
      AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_REQUEST_SCHEMA_VERSION,
    id: `publication_evidence_request_${requestHash.slice(0, 24)}`,
    projectId: monitor.projectId,
    bookId: monitor.bookId,
    monitor: Object.freeze({
      id: monitor.id,
      revision: monitor.revision,
      fingerprint: monitor.fingerprint,
      listingIdentityId: monitor.listingIdentity.id,
      listingIdentityFingerprint: monitor.listingIdentity.fingerprint,
      latestVerificationFingerprint:
        monitor.entries.at(-1)!.verificationFingerprint,
      lastVerifiedAt: monitor.lastVerifiedAt,
      nextRefreshDueAt: monitor.nextRefreshDueAt,
    }),
    requiredRegions: monitor.requiredRegions,
    requestFingerprint: requestHash,
    requestedAt: requestedAt.toISOString(),
  };
  const request = Object.freeze({
    ...partial,
    fingerprint: requestFingerprint(partial),
  });
  assertAudiobookRetailPublicationEvidenceRequest(request);
  return request;
}

export function assertAudiobookRetailPublicationEvidenceRequest(
  request: AudiobookRetailPublicationEvidenceRequest,
): void {
  if (
    request.schemaVersion
      !== AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_REQUEST_SCHEMA_VERSION
  ) {
    throw new AudiobookRetailPublicationEvidenceInboxError(
      "AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_REQUEST_SCHEMA_UNSUPPORTED",
    );
  }
  for (const [value, code] of [
    [request.id, "AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_REQUEST_ID_INVALID"],
    [request.projectId, "AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_PROJECT_ID_INVALID"],
    [request.bookId, "AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_BOOK_ID_INVALID"],
    [request.monitor.id, "AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_MONITOR_ID_INVALID"],
    [request.monitor.listingIdentityId, "AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_LISTING_ID_INVALID"],
  ] as const) requireIdentifier(value, code);
  for (const [value, code] of [
    [request.monitor.fingerprint, "AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_MONITOR_HASH_INVALID"],
    [request.monitor.listingIdentityFingerprint, "AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_LISTING_HASH_INVALID"],
    [request.monitor.latestVerificationFingerprint, "AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_LATEST_VERIFICATION_HASH_INVALID"],
    [request.requestFingerprint, "AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_REQUEST_HASH_INVALID"],
  ] as const) requireHash(value, code);
  requireInteger(
    request.monitor.revision,
    1,
    Number.MAX_SAFE_INTEGER,
    "AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_MONITOR_REVISION_INVALID",
  );
  for (const value of [
    request.monitor.lastVerifiedAt,
    request.monitor.nextRefreshDueAt,
    request.requestedAt,
  ]) requireDate(value, "AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_REQUEST_DATE_INVALID");
  const regions = normaliseRegions(request.requiredRegions);
  if (stableHash(regions) !== stableHash(request.requiredRegions)) {
    throw new AudiobookRetailPublicationEvidenceInboxError(
      "AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_REGIONS_INVALID",
    );
  }
  const expectedRequestHash = stableHash({
    monitorId: request.monitor.id,
    monitorRevision: request.monitor.revision,
    monitorFingerprint: request.monitor.fingerprint,
    latestVerificationFingerprint:
      request.monitor.latestVerificationFingerprint,
    nextRefreshDueAt: request.monitor.nextRefreshDueAt,
  });
  if (expectedRequestHash !== request.requestFingerprint) {
    throw new AudiobookRetailPublicationEvidenceInboxError(
      "AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_REQUEST_SCOPE_INVALID",
    );
  }
  const { fingerprint, ...partial } = request;
  if (requestFingerprint(partial) !== fingerprint) {
    throw new AudiobookRetailPublicationEvidenceInboxError(
      "AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_REQUEST_FINGERPRINT_INVALID",
    );
  }
}

export function assertAudiobookRetailPublicationEvidenceMatchesRequest(
  request: AudiobookRetailPublicationEvidenceRequest,
  verification: AudiobookRetailPublicationVerification,
  now = new Date(),
): void {
  assertAudiobookRetailPublicationEvidenceRequest(request);
  assertAudiobookRetailPublicationVerification(verification);
  if (Number.isNaN(now.getTime())) {
    throw new AudiobookRetailPublicationEvidenceInboxError(
      "AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_DATE_INVALID",
    );
  }
  if (
    verification.projectId !== request.projectId
    || verification.bookId !== request.bookId
    || verification.listingIdentity.id !== request.monitor.listingIdentityId
    || verification.listingIdentity.fingerprint
      !== request.monitor.listingIdentityFingerprint
    || stableHash(verification.requiredRegions)
      !== stableHash(request.requiredRegions)
    || verification.fingerprint
      === request.monitor.latestVerificationFingerprint
    || Date.parse(verification.verifiedAt)
      <= Date.parse(request.monitor.lastVerifiedAt)
    || Date.parse(verification.verifiedAt) > now.getTime()
    || Date.parse(verification.observation.expiresAt) <= now.getTime()
  ) {
    throw new AudiobookRetailPublicationEvidenceInboxError(
      "AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_REQUEST_MISMATCH",
    );
  }
}

export function submitAudiobookRetailPublicationEvidence(input: Readonly<{
  request: AudiobookRetailPublicationEvidenceRequest;
  verification: AudiobookRetailPublicationVerification;
  sourceReferenceHash: string;
  receivedByActorId: string;
  receivedAt?: Date;
}>): AudiobookRetailPublicationEvidenceInboxItem {
  const receivedAt = input.receivedAt ?? new Date();
  if (
    Number.isNaN(receivedAt.getTime())
    || receivedAt.getTime() < Date.parse(input.request.requestedAt)
  ) {
    throw new AudiobookRetailPublicationEvidenceInboxError(
      "AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_RECEIVED_DATE_INVALID",
    );
  }
  assertAudiobookRetailPublicationEvidenceMatchesRequest(
    input.request,
    input.verification,
    receivedAt,
  );
  const identityHash = stableHash({
    requestFingerprint: input.request.requestFingerprint,
    verificationFingerprint: input.verification.fingerprint,
  });
  const partial: Omit<
    AudiobookRetailPublicationEvidenceInboxItem,
    "fingerprint"
  > = {
    schemaVersion:
      AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_INBOX_SCHEMA_VERSION,
    id: `publication_evidence_${identityHash.slice(0, 24)}`,
    projectId: input.request.projectId,
    bookId: input.request.bookId,
    request: input.request,
    verification: input.verification,
    sourceReferenceHash: requireHash(
      input.sourceReferenceHash,
      "AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_SOURCE_HASH_INVALID",
    ),
    receivedByActorId: requireIdentifier(
      input.receivedByActorId,
      "AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_RECEIVER_INVALID",
    ),
    receivedAt: receivedAt.toISOString(),
    status: "available",
    revision: 1,
    updatedAt: receivedAt.toISOString(),
  };
  const item = Object.freeze({
    ...partial,
    fingerprint: inboxItemFingerprint(partial),
  });
  assertAudiobookRetailPublicationEvidenceInboxItem(item);
  return item;
}

function reviseInboxItem(
  item: AudiobookRetailPublicationEvidenceInboxItem,
  updates: Pick<
    AudiobookRetailPublicationEvidenceInboxItem,
    "acknowledgement" | "status"
  >,
  updatedAt: Date,
): AudiobookRetailPublicationEvidenceInboxItem {
  assertAudiobookRetailPublicationEvidenceInboxItem(item);
  if (
    Number.isNaN(updatedAt.getTime())
    || updatedAt.getTime() < Date.parse(item.updatedAt)
  ) {
    throw new AudiobookRetailPublicationEvidenceInboxError(
      "AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_DATE_REVERSED",
    );
  }
  const {
    fingerprint: _fingerprint,
    previousFingerprint: _previous,
    ...base
  } = item;
  const partial: Omit<
    AudiobookRetailPublicationEvidenceInboxItem,
    "fingerprint"
  > = {
    ...base,
    ...updates,
    revision: item.revision + 1,
    previousFingerprint: item.fingerprint,
    updatedAt: updatedAt.toISOString(),
  };
  const next = Object.freeze({
    ...partial,
    fingerprint: inboxItemFingerprint(partial),
  });
  assertAudiobookRetailPublicationEvidenceInboxItem(next);
  return next;
}

export function acknowledgeAudiobookRetailPublicationEvidence(
  item: AudiobookRetailPublicationEvidenceInboxItem,
  input: Readonly<{
    monitor: AudiobookRetailPublicationMonitor;
    acknowledgedByActorId: string;
    acknowledgedAt?: Date;
  }>,
): AudiobookRetailPublicationEvidenceInboxItem {
  assertAudiobookRetailPublicationEvidenceInboxItem(item);
  assertAudiobookRetailPublicationMonitor(input.monitor);
  if (item.status === "acknowledged") return item;
  const acknowledgedAt = input.acknowledgedAt ?? new Date();
  const latestEntry = input.monitor.entries.at(-1)!;
  if (
    Number.isNaN(acknowledgedAt.getTime())
    || acknowledgedAt.getTime() < Date.parse(item.updatedAt)
    || acknowledgedAt.getTime() < Date.parse(input.monitor.updatedAt)
    || input.monitor.id !== item.request.monitor.id
    || input.monitor.projectId !== item.projectId
    || input.monitor.bookId !== item.bookId
    || input.monitor.listingIdentity.id
      !== item.request.monitor.listingIdentityId
    || input.monitor.listingIdentity.fingerprint
      !== item.request.monitor.listingIdentityFingerprint
    || input.monitor.revision <= item.request.monitor.revision
    || latestEntry.verificationFingerprint !== item.verification.fingerprint
    || input.monitor.lastVerifiedAt !== item.verification.verifiedAt
  ) {
    throw new AudiobookRetailPublicationEvidenceInboxError(
      "AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_ACKNOWLEDGEMENT_INVALID",
    );
  }
  const acknowledgementBase: Omit<
    AudiobookRetailPublicationEvidenceAcknowledgement,
    "fingerprint"
  > = {
    monitorRevision: input.monitor.revision,
    monitorFingerprint: input.monitor.fingerprint,
    verificationFingerprint: item.verification.fingerprint,
    acknowledgedByActorId: requireIdentifier(
      input.acknowledgedByActorId,
      "AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_ACKNOWLEDGER_INVALID",
    ),
    acknowledgedAt: acknowledgedAt.toISOString(),
  };
  const acknowledgement = Object.freeze({
    ...acknowledgementBase,
    fingerprint: acknowledgementFingerprint(acknowledgementBase),
  });
  return reviseInboxItem(
    item,
    { acknowledgement, status: "acknowledged" },
    acknowledgedAt,
  );
}

export function assertAudiobookRetailPublicationEvidenceInboxItem(
  item: AudiobookRetailPublicationEvidenceInboxItem,
): void {
  if (
    item.schemaVersion
      !== AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_INBOX_SCHEMA_VERSION
  ) {
    throw new AudiobookRetailPublicationEvidenceInboxError(
      "AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_SCHEMA_UNSUPPORTED",
    );
  }
  for (const [value, code] of [
    [item.id, "AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_ID_INVALID"],
    [item.projectId, "AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_PROJECT_ID_INVALID"],
    [item.bookId, "AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_BOOK_ID_INVALID"],
    [item.receivedByActorId, "AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_RECEIVER_INVALID"],
  ] as const) requireIdentifier(value, code);
  requireHash(
    item.sourceReferenceHash,
    "AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_SOURCE_HASH_INVALID",
  );
  assertAudiobookRetailPublicationEvidenceRequest(item.request);
  assertAudiobookRetailPublicationVerification(item.verification);
  assertAudiobookRetailPublicationEvidenceMatchesRequest(
    item.request,
    item.verification,
    new Date(item.receivedAt),
  );
  if (
    item.projectId !== item.request.projectId
    || item.bookId !== item.request.bookId
  ) {
    throw new AudiobookRetailPublicationEvidenceInboxError(
      "AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_SCOPE_INVALID",
    );
  }
  for (const value of [item.receivedAt, item.updatedAt]) {
    requireDate(value, "AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_DATE_INVALID");
  }
  if (Date.parse(item.updatedAt) < Date.parse(item.receivedAt)) {
    throw new AudiobookRetailPublicationEvidenceInboxError(
      "AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_DATE_REVERSED",
    );
  }
  if (item.acknowledgement) {
    requireInteger(
      item.acknowledgement.monitorRevision,
      item.request.monitor.revision + 1,
      Number.MAX_SAFE_INTEGER,
      "AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_ACK_MONITOR_REVISION_INVALID",
    );
    for (const [value, code] of [
      [item.acknowledgement.monitorFingerprint, "AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_ACK_MONITOR_HASH_INVALID"],
      [item.acknowledgement.verificationFingerprint, "AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_ACK_VERIFICATION_HASH_INVALID"],
    ] as const) requireHash(value, code);
    requireIdentifier(
      item.acknowledgement.acknowledgedByActorId,
      "AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_ACKNOWLEDGER_INVALID",
    );
    requireDate(
      item.acknowledgement.acknowledgedAt,
      "AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_ACK_DATE_INVALID",
    );
    if (
      item.acknowledgement.verificationFingerprint
        !== item.verification.fingerprint
      || Date.parse(item.acknowledgement.acknowledgedAt)
        < Date.parse(item.receivedAt)
    ) {
      throw new AudiobookRetailPublicationEvidenceInboxError(
        "AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_ACKNOWLEDGEMENT_INVALID",
      );
    }
    const { fingerprint, ...partial } = item.acknowledgement;
    if (acknowledgementFingerprint(partial) !== fingerprint) {
      throw new AudiobookRetailPublicationEvidenceInboxError(
        "AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_ACK_FINGERPRINT_INVALID",
      );
    }
  }
  const expectedStatus: AudiobookRetailPublicationEvidenceInboxStatus =
    item.acknowledgement ? "acknowledged" : "available";
  if (item.status !== expectedStatus) {
    throw new AudiobookRetailPublicationEvidenceInboxError(
      "AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_STATUS_INVALID",
    );
  }
  requireInteger(
    item.revision,
    1,
    2,
    "AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_REVISION_INVALID",
  );
  if (
    (item.revision === 1 && item.previousFingerprint !== undefined)
    || (
      item.revision === 2
      && !HASH_PATTERN.test(item.previousFingerprint ?? "")
    )
    || (item.revision === 1 && item.acknowledgement !== undefined)
    || (item.revision === 2 && item.acknowledgement === undefined)
  ) {
    throw new AudiobookRetailPublicationEvidenceInboxError(
      "AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_REVISION_CHAIN_INVALID",
    );
  }
  const { fingerprint, ...partial } = item;
  if (inboxItemFingerprint(partial) !== fingerprint) {
    throw new AudiobookRetailPublicationEvidenceInboxError(
      "AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_FINGERPRINT_INVALID",
    );
  }
}

export function audiobookRetailPublicationEvidenceInboxPublicView(
  item: AudiobookRetailPublicationEvidenceInboxItem,
): AudiobookRetailPublicationEvidenceInboxPublicView {
  assertAudiobookRetailPublicationEvidenceInboxItem(item);
  return Object.freeze({
    id: item.id,
    bookId: item.bookId,
    monitorId: item.request.monitor.id,
    expectedMonitorRevision: item.request.monitor.revision,
    requiredRegions: item.request.requiredRegions,
    verificationStatus: item.verification.status,
    verificationVerifiedAt: item.verification.verifiedAt,
    observationExpiresAt: item.verification.observation.expiresAt,
    status: item.status,
    receivedAt: item.receivedAt,
    ...(item.acknowledgement
      ? { acknowledgedAt: item.acknowledgement.acknowledgedAt }
      : {}),
    revision: item.revision,
    updatedAt: item.updatedAt,
    fingerprint: item.fingerprint,
  });
}

function toEnvelope(
  envelope: StoredEnvelope<Record<string, unknown>>,
): StoredEnvelope<AudiobookRetailPublicationEvidenceInboxItem> {
  const item = envelope.payload
    as unknown as AudiobookRetailPublicationEvidenceInboxItem;
  assertAudiobookRetailPublicationEvidenceInboxItem(item);
  if (
    envelope.entityType
      !== AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_INBOX_ENTITY_TYPE
    || envelope.entityId !== item.id
    || envelope.revision !== item.revision
  ) {
    throw new AudiobookRetailPublicationEvidenceInboxStoreConflictError(
      "AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_STORE_ENVELOPE_SCOPE_MISMATCH",
    );
  }
  return envelope as unknown as StoredEnvelope<
    AudiobookRetailPublicationEvidenceInboxItem
  >;
}

export class FileAudiobookRetailPublicationEvidenceInboxStore {
  readonly #store: FileProjectStore;

  constructor(store: FileProjectStore) {
    this.#store = store;
  }

  async create(
    item: AudiobookRetailPublicationEvidenceInboxItem,
    actorId: string,
  ): Promise<StoredEnvelope<AudiobookRetailPublicationEvidenceInboxItem>> {
    assertAudiobookRetailPublicationEvidenceInboxItem(item);
    requireIdentifier(
      actorId,
      "AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_STORE_ACTOR_INVALID",
    );
    const existing = await this.read(item.id);
    if (existing) {
      if (existing.payload.fingerprint === item.fingerprint) return existing;
      throw new AudiobookRetailPublicationEvidenceInboxStoreConflictError(
        "AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_STORE_IDEMPOTENCY_CONFLICT",
      );
    }
    try {
      const envelope = toEnvelope(await this.#store.create(
        AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_INBOX_ENTITY_TYPE,
        item.id,
        item as unknown as Record<string, unknown>,
        new Date(item.receivedAt),
      ));
      await this.#audit(
        actorId,
        "audiobook_retail_publication_evidence.received",
        envelope,
      );
      return envelope;
    } catch (error) {
      if (error instanceof StoreConflictError) {
        throw new AudiobookRetailPublicationEvidenceInboxStoreConflictError(
          error.message,
        );
      }
      throw error;
    }
  }

  async read(
    itemId: string,
  ): Promise<StoredEnvelope<AudiobookRetailPublicationEvidenceInboxItem> | null> {
    requireIdentifier(
      itemId,
      "AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_STORE_ID_INVALID",
    );
    const envelope = await this.#store.read<Record<string, unknown>>(
      AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_INBOX_ENTITY_TYPE,
      itemId,
    );
    return envelope ? toEnvelope(envelope) : null;
  }

  async require(
    itemId: string,
  ): Promise<StoredEnvelope<AudiobookRetailPublicationEvidenceInboxItem>> {
    const envelope = await this.read(itemId);
    if (!envelope) {
      throw new AudiobookRetailPublicationEvidenceInboxStoreConflictError(
        "AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_STORE_NOT_FOUND",
      );
    }
    return envelope;
  }

  async findCurrentForRequest(
    request: AudiobookRetailPublicationEvidenceRequest,
    now = new Date(),
  ): Promise<StoredEnvelope<AudiobookRetailPublicationEvidenceInboxItem> | null> {
    assertAudiobookRetailPublicationEvidenceRequest(request);
    if (Number.isNaN(now.getTime())) {
      throw new AudiobookRetailPublicationEvidenceInboxError(
        "AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_DATE_INVALID",
      );
    }
    const rows = await this.#store.list(
      AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_INBOX_ENTITY_TYPE,
    );
    const candidates: StoredEnvelope<
      AudiobookRetailPublicationEvidenceInboxItem
    >[] = [];
    for (const row of rows) {
      const envelope = await this.require(row.entityId);
      if (
        envelope.payload.status === "available"
        && envelope.payload.request.requestFingerprint
          === request.requestFingerprint
        && Date.parse(envelope.payload.verification.observation.expiresAt)
          > now.getTime()
      ) {
        candidates.push(envelope);
      }
    }
    candidates.sort((left, right) =>
      Date.parse(right.payload.verification.verifiedAt)
        - Date.parse(left.payload.verification.verifiedAt)
      || Date.parse(right.payload.receivedAt)
        - Date.parse(left.payload.receivedAt)
      || left.entityId.localeCompare(right.entityId, "en-AU")
    );
    return candidates.at(0) ?? null;
  }

  async save(
    item: AudiobookRetailPublicationEvidenceInboxItem,
    input: Readonly<{
      expectedRevision: number;
      actorId: string;
      action: string;
    }>,
  ): Promise<StoredEnvelope<AudiobookRetailPublicationEvidenceInboxItem>> {
    assertAudiobookRetailPublicationEvidenceInboxItem(item);
    requireIdentifier(
      input.actorId,
      "AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_STORE_ACTOR_INVALID",
    );
    if (
      !/^audiobook_retail_publication_evidence\.[a-z][a-z0-9._-]{1,80}$/u
        .test(input.action)
    ) {
      throw new AudiobookRetailPublicationEvidenceInboxStoreConflictError(
        "AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_STORE_ACTION_INVALID",
      );
    }
    const current = await this.require(item.id);
    if (
      current.revision !== input.expectedRevision
      || item.revision !== current.payload.revision + 1
      || item.previousFingerprint !== current.payload.fingerprint
    ) {
      throw new AudiobookRetailPublicationEvidenceInboxStoreConflictError(
        "AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_STORE_REVISION_CONFLICT",
      );
    }
    try {
      const envelope = toEnvelope(await this.#store.replace(
        AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_INBOX_ENTITY_TYPE,
        item.id,
        input.expectedRevision,
        item as unknown as Record<string, unknown>,
        new Date(item.updatedAt),
      ));
      await this.#audit(input.actorId, input.action, envelope);
      return envelope;
    } catch (error) {
      if (error instanceof StoreConflictError) {
        throw new AudiobookRetailPublicationEvidenceInboxStoreConflictError(
          error.message,
        );
      }
      throw error;
    }
  }

  async #audit(
    actorId: string,
    action: string,
    envelope: StoredEnvelope<AudiobookRetailPublicationEvidenceInboxItem>,
  ): Promise<void> {
    await this.#store.appendAuditEvent({
      actorId,
      action,
      entityType: AUDIOBOOK_RETAIL_PUBLICATION_EVIDENCE_INBOX_ENTITY_TYPE,
      entityId: envelope.entityId,
      revision: envelope.revision,
      occurredAt: new Date(envelope.savedAt),
      metadata: {
        status: envelope.payload.status,
        verificationStatus: envelope.payload.verification.status,
        expectedMonitorRevision:
          envelope.payload.request.monitor.revision,
        requiredRegionCount:
          envelope.payload.request.requiredRegions.length,
        acknowledged: envelope.payload.acknowledgement !== undefined,
      },
    });
  }
}
