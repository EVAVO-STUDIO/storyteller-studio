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

export const AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_SCHEMA_VERSION =
  "storyteller-audiobook-retail-publication-monitor-v1" as const;
export const AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_ENTITY_TYPE =
  "audiobook-retail-publication-monitor" as const;

export type AudiobookRetailPublicationHealth =
  | "healthy-live"
  | "degraded"
  | "unavailable"
  | "mismatch"
  | "stale";

export type AudiobookRetailPublicationTransitionKind =
  | "initialized"
  | "refresh"
  | "state-change"
  | "regression"
  | "recovery"
  | "stale";

export interface AudiobookRetailPublicationMonitorEntry {
  sequence: number;
  verificationId: string;
  verificationFingerprint: string;
  listingIdentityId: string;
  listingIdentityFingerprint: string;
  observationFingerprint: string;
  requiredRegions: readonly string[];
  verificationStatus: AudiobookRetailPublicationVerificationStatus;
  health: Exclude<AudiobookRetailPublicationHealth, "stale">;
  retailerAcceptanceConfirmed: true;
  publicationConfirmed: boolean;
  liveConfirmed: boolean;
  purchaseConfirmed: boolean;
  samplePlaybackConfirmed: boolean;
  findingCodes: readonly string[];
  verifiedAt: string;
  observationExpiresAt: string;
  fingerprint: string;
}

export interface AudiobookRetailPublicationMonitorTransition {
  sequence: number;
  kind: AudiobookRetailPublicationTransitionKind;
  fromHealth?: AudiobookRetailPublicationHealth;
  toHealth: AudiobookRetailPublicationHealth;
  findingCodes: readonly string[];
  occurredAt: string;
  evidenceFingerprint: string;
  fingerprint: string;
}

export interface AudiobookRetailPublicationMonitor {
  schemaVersion: typeof AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_SCHEMA_VERSION;
  id: string;
  projectId: string;
  bookId: string;
  distributor: "acx-audible";
  listingIdentity: Readonly<{
    id: string;
    fingerprint: string;
  }>;
  requiredRegions: readonly string[];
  refreshIntervalHours: number;
  entries: readonly AudiobookRetailPublicationMonitorEntry[];
  transitions: readonly AudiobookRetailPublicationMonitorTransition[];
  currentHealth: AudiobookRetailPublicationHealth;
  latestVerificationStatus: AudiobookRetailPublicationVerificationStatus;
  latestFindingCodes: readonly string[];
  lastVerifiedAt: string;
  observationExpiresAt: string;
  nextRefreshDueAt: string;
  status: "active";
  revision: number;
  previousFingerprint?: string;
  createdAt: string;
  updatedAt: string;
  fingerprint: string;
}

export interface AudiobookRetailPublicationMonitorPublicView {
  id: string;
  bookId: string;
  distributor: "acx-audible";
  requiredRegions: readonly string[];
  refreshIntervalHours: number;
  entryCount: number;
  transitionCount: number;
  currentHealth: AudiobookRetailPublicationHealth;
  latestVerificationStatus: AudiobookRetailPublicationVerificationStatus;
  latestFindingCodes: readonly string[];
  lastVerifiedAt: string;
  observationExpiresAt: string;
  nextRefreshDueAt: string;
  refreshDue: boolean;
  latestTransition: Readonly<{
    kind: AudiobookRetailPublicationTransitionKind;
    fromHealth?: AudiobookRetailPublicationHealth;
    toHealth: AudiobookRetailPublicationHealth;
    occurredAt: string;
  }>;
  revision: number;
  createdAt: string;
  updatedAt: string;
  fingerprint: string;
}

export class AudiobookRetailPublicationMonitorError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "AudiobookRetailPublicationMonitorError";
    this.code = code;
  }
}

export class AudiobookRetailPublicationMonitorStoreConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AudiobookRetailPublicationMonitorStoreConflictError";
  }
}

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const REGION_PATTERN = /^[A-Z]{2}$/u;
const FINDING_CODE_PATTERN = /^[A-Z][A-Z0-9_]{2,95}$/u;
const MINIMUM_REFRESH_INTERVAL_HOURS = 1;
const MAXIMUM_REFRESH_INTERVAL_HOURS = 168;
const MAXIMUM_ENTRIES = 2_000;
const MAXIMUM_TRANSITIONS = 4_000;
const MAXIMUM_FINDINGS = 200;

function requireIdentifier(value: string, code: string): string {
  if (!SAFE_IDENTIFIER.test(value)) {
    throw new AudiobookRetailPublicationMonitorError(code);
  }
  return value;
}

function requireHash(value: string, code: string): string {
  if (!HASH_PATTERN.test(value)) {
    throw new AudiobookRetailPublicationMonitorError(code);
  }
  return value;
}

function requireDate(value: string, code: string): string {
  if (!value || Number.isNaN(Date.parse(value))) {
    throw new AudiobookRetailPublicationMonitorError(code);
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
    throw new AudiobookRetailPublicationMonitorError(code);
  }
  return value;
}

function normaliseRegions(values: readonly string[]): readonly string[] {
  if (!Array.isArray(values) || values.length === 0 || values.length > 32) {
    throw new AudiobookRetailPublicationMonitorError(
      "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_REGIONS_INVALID",
    );
  }
  const regions = new Set<string>();
  for (const value of values) {
    if (!REGION_PATTERN.test(value) || regions.has(value)) {
      throw new AudiobookRetailPublicationMonitorError(
        "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_REGIONS_INVALID",
      );
    }
    regions.add(value);
  }
  return Object.freeze(
    [...regions].sort((left, right) => left.localeCompare(right, "en-AU")),
  );
}

function normaliseFindings(values: readonly string[]): readonly string[] {
  if (!Array.isArray(values) || values.length > MAXIMUM_FINDINGS) {
    throw new AudiobookRetailPublicationMonitorError(
      "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_FINDINGS_INVALID",
    );
  }
  const findings = new Set<string>();
  for (const code of values) {
    if (!FINDING_CODE_PATTERN.test(code) || findings.has(code)) {
      throw new AudiobookRetailPublicationMonitorError(
        "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_FINDINGS_INVALID",
      );
    }
    findings.add(code);
  }
  return Object.freeze(
    [...findings].sort((left, right) => left.localeCompare(right, "en-AU")),
  );
}

function healthFromStatus(
  status: AudiobookRetailPublicationVerificationStatus,
): Exclude<AudiobookRetailPublicationHealth, "stale"> {
  switch (status) {
    case "published-and-live":
      return "healthy-live";
    case "published-but-unavailable":
      return "degraded";
    case "publication-mismatch":
      return "mismatch";
    case "not-yet-published":
      return "unavailable";
  }
}

function entryFingerprint(
  value: Omit<AudiobookRetailPublicationMonitorEntry, "fingerprint">,
): string {
  return stableHash(value);
}

function transitionFingerprint(
  value: Omit<AudiobookRetailPublicationMonitorTransition, "fingerprint">,
): string {
  return stableHash(value);
}

function monitorFingerprint(
  value: Omit<AudiobookRetailPublicationMonitor, "fingerprint">,
): string {
  return stableHash(value);
}

function createEntry(
  verification: AudiobookRetailPublicationVerification,
  sequence: number,
): AudiobookRetailPublicationMonitorEntry {
  assertAudiobookRetailPublicationVerification(verification);
  const health = healthFromStatus(verification.status);
  const partial: Omit<AudiobookRetailPublicationMonitorEntry, "fingerprint"> = {
    sequence,
    verificationId: verification.id,
    verificationFingerprint: verification.fingerprint,
    listingIdentityId: verification.listingIdentity.id,
    listingIdentityFingerprint: verification.listingIdentity.fingerprint,
    observationFingerprint: verification.observation.fingerprint,
    requiredRegions: verification.requiredRegions,
    verificationStatus: verification.status,
    health,
    retailerAcceptanceConfirmed: true,
    publicationConfirmed: verification.publicationConfirmed,
    liveConfirmed: verification.liveConfirmed,
    purchaseConfirmed: verification.purchaseConfirmed,
    samplePlaybackConfirmed: verification.samplePlaybackConfirmed,
    findingCodes: normaliseFindings(verification.findingCodes),
    verifiedAt: verification.verifiedAt,
    observationExpiresAt: verification.observation.expiresAt,
  };
  return Object.freeze({
    ...partial,
    fingerprint: entryFingerprint(partial),
  });
}

function createTransition(input: Readonly<{
  sequence: number;
  kind: AudiobookRetailPublicationTransitionKind;
  fromHealth?: AudiobookRetailPublicationHealth;
  toHealth: AudiobookRetailPublicationHealth;
  findingCodes: readonly string[];
  occurredAt: string;
  evidenceFingerprint: string;
}>): AudiobookRetailPublicationMonitorTransition {
  requireHash(
    input.evidenceFingerprint,
    "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_TRANSITION_EVIDENCE_HASH_INVALID",
  );
  requireDate(
    input.occurredAt,
    "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_TRANSITION_DATE_INVALID",
  );
  const partial: Omit<
    AudiobookRetailPublicationMonitorTransition,
    "fingerprint"
  > = {
    sequence: input.sequence,
    kind: input.kind,
    ...(input.fromHealth ? { fromHealth: input.fromHealth } : {}),
    toHealth: input.toHealth,
    findingCodes: normaliseFindings(input.findingCodes),
    occurredAt: input.occurredAt,
    evidenceFingerprint: input.evidenceFingerprint,
  };
  return Object.freeze({
    ...partial,
    fingerprint: transitionFingerprint(partial),
  });
}

function nextRefreshDueAt(
  verifiedAt: string,
  observationExpiresAt: string,
  refreshIntervalHours: number,
): string {
  const intervalDue = Date.parse(verifiedAt)
    + refreshIntervalHours * 60 * 60 * 1_000;
  return new Date(Math.min(intervalDue, Date.parse(observationExpiresAt)))
    .toISOString();
}

function transitionKind(
  fromHealth: AudiobookRetailPublicationHealth,
  toHealth: Exclude<AudiobookRetailPublicationHealth, "stale">,
): AudiobookRetailPublicationTransitionKind {
  if (fromHealth === toHealth) return "refresh";
  if (fromHealth === "healthy-live" && toHealth !== "healthy-live") {
    return "regression";
  }
  if (fromHealth !== "healthy-live" && toHealth === "healthy-live") {
    return "recovery";
  }
  return "state-change";
}

function assertEntry(entry: AudiobookRetailPublicationMonitorEntry): void {
  requireInteger(
    entry.sequence,
    1,
    MAXIMUM_ENTRIES,
    "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_ENTRY_SEQUENCE_INVALID",
  );
  for (const [value, code] of [
    [entry.verificationId, "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_VERIFICATION_ID_INVALID"],
    [entry.listingIdentityId, "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_LISTING_ID_INVALID"],
  ] as const) requireIdentifier(value, code);
  for (const [value, code] of [
    [entry.verificationFingerprint, "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_VERIFICATION_HASH_INVALID"],
    [entry.listingIdentityFingerprint, "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_LISTING_HASH_INVALID"],
    [entry.observationFingerprint, "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_OBSERVATION_HASH_INVALID"],
  ] as const) requireHash(value, code);
  normaliseRegions(entry.requiredRegions);
  if (entry.health !== healthFromStatus(entry.verificationStatus)) {
    throw new AudiobookRetailPublicationMonitorError(
      "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_ENTRY_HEALTH_INVALID",
    );
  }
  if (entry.retailerAcceptanceConfirmed !== true) {
    throw new AudiobookRetailPublicationMonitorError(
      "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_ACCEPTANCE_REQUIRED",
    );
  }
  normaliseFindings(entry.findingCodes);
  requireDate(
    entry.verifiedAt,
    "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_ENTRY_DATE_INVALID",
  );
  requireDate(
    entry.observationExpiresAt,
    "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_ENTRY_EXPIRY_INVALID",
  );
  const { fingerprint, ...partial } = entry;
  if (entryFingerprint(partial) !== fingerprint) {
    throw new AudiobookRetailPublicationMonitorError(
      "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_ENTRY_FINGERPRINT_INVALID",
    );
  }
}

function assertTransition(
  transition: AudiobookRetailPublicationMonitorTransition,
): void {
  requireInteger(
    transition.sequence,
    1,
    MAXIMUM_TRANSITIONS,
    "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_TRANSITION_SEQUENCE_INVALID",
  );
  if (
    ![
      "initialized",
      "refresh",
      "state-change",
      "regression",
      "recovery",
      "stale",
    ].includes(transition.kind)
  ) {
    throw new AudiobookRetailPublicationMonitorError(
      "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_TRANSITION_KIND_INVALID",
    );
  }
  normaliseFindings(transition.findingCodes);
  requireDate(
    transition.occurredAt,
    "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_TRANSITION_DATE_INVALID",
  );
  requireHash(
    transition.evidenceFingerprint,
    "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_TRANSITION_EVIDENCE_HASH_INVALID",
  );
  const { fingerprint, ...partial } = transition;
  if (transitionFingerprint(partial) !== fingerprint) {
    throw new AudiobookRetailPublicationMonitorError(
      "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_TRANSITION_FINGERPRINT_INVALID",
    );
  }
}

function reviseMonitor(
  monitor: AudiobookRetailPublicationMonitor,
  input: Readonly<{
    entries?: readonly AudiobookRetailPublicationMonitorEntry[];
    transitions?: readonly AudiobookRetailPublicationMonitorTransition[];
    currentHealth: AudiobookRetailPublicationHealth;
    latestVerificationStatus: AudiobookRetailPublicationVerificationStatus;
    latestFindingCodes: readonly string[];
    lastVerifiedAt: string;
    observationExpiresAt: string;
    nextRefreshDueAt: string;
    updatedAt: Date;
  }>,
): AudiobookRetailPublicationMonitor {
  assertAudiobookRetailPublicationMonitor(monitor);
  if (input.updatedAt.getTime() < Date.parse(monitor.updatedAt)) {
    throw new AudiobookRetailPublicationMonitorError(
      "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_TIME_REVERSED",
    );
  }
  const {
    fingerprint: _fingerprint,
    previousFingerprint: _previous,
    ...base
  } = monitor;
  const partial: Omit<AudiobookRetailPublicationMonitor, "fingerprint"> = {
    ...base,
    ...(input.entries ? { entries: input.entries } : {}),
    ...(input.transitions ? { transitions: input.transitions } : {}),
    currentHealth: input.currentHealth,
    latestVerificationStatus: input.latestVerificationStatus,
    latestFindingCodes: normaliseFindings(input.latestFindingCodes),
    lastVerifiedAt: input.lastVerifiedAt,
    observationExpiresAt: input.observationExpiresAt,
    nextRefreshDueAt: input.nextRefreshDueAt,
    revision: monitor.revision + 1,
    previousFingerprint: monitor.fingerprint,
    createdAt: monitor.createdAt,
    updatedAt: input.updatedAt.toISOString(),
  };
  const next = Object.freeze({
    ...partial,
    fingerprint: monitorFingerprint(partial),
  });
  assertAudiobookRetailPublicationMonitor(next);
  return next;
}

export function createAudiobookRetailPublicationMonitor(input: Readonly<{
  id: string;
  verification: AudiobookRetailPublicationVerification;
  refreshIntervalHours?: number;
  createdAt?: Date;
}>): AudiobookRetailPublicationMonitor {
  requireIdentifier(
    input.id,
    "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_ID_INVALID",
  );
  assertAudiobookRetailPublicationVerification(input.verification);
  const createdAt = input.createdAt ?? new Date(input.verification.verifiedAt);
  if (
    Number.isNaN(createdAt.getTime())
    || createdAt.getTime() < Date.parse(input.verification.verifiedAt)
  ) {
    throw new AudiobookRetailPublicationMonitorError(
      "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_DATE_INVALID",
    );
  }
  const refreshIntervalHours = requireInteger(
    input.refreshIntervalHours ?? 24,
    MINIMUM_REFRESH_INTERVAL_HOURS,
    MAXIMUM_REFRESH_INTERVAL_HOURS,
    "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_INTERVAL_INVALID",
  );
  const entry = createEntry(input.verification, 1);
  const transition = createTransition({
    sequence: 1,
    kind: "initialized",
    toHealth: entry.health,
    findingCodes: entry.findingCodes,
    occurredAt: createdAt.toISOString(),
    evidenceFingerprint: entry.fingerprint,
  });
  const partial: Omit<AudiobookRetailPublicationMonitor, "fingerprint"> = {
    schemaVersion: AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_SCHEMA_VERSION,
    id: input.id,
    projectId: input.verification.projectId,
    bookId: input.verification.bookId,
    distributor: "acx-audible",
    listingIdentity: Object.freeze({
      id: input.verification.listingIdentity.id,
      fingerprint: input.verification.listingIdentity.fingerprint,
    }),
    requiredRegions: input.verification.requiredRegions,
    refreshIntervalHours,
    entries: Object.freeze([entry]),
    transitions: Object.freeze([transition]),
    currentHealth: entry.health,
    latestVerificationStatus: entry.verificationStatus,
    latestFindingCodes: entry.findingCodes,
    lastVerifiedAt: entry.verifiedAt,
    observationExpiresAt: entry.observationExpiresAt,
    nextRefreshDueAt: nextRefreshDueAt(
      entry.verifiedAt,
      entry.observationExpiresAt,
      refreshIntervalHours,
    ),
    status: "active",
    revision: 1,
    createdAt: createdAt.toISOString(),
    updatedAt: createdAt.toISOString(),
  };
  const monitor = Object.freeze({
    ...partial,
    fingerprint: monitorFingerprint(partial),
  });
  assertAudiobookRetailPublicationMonitor(monitor);
  return monitor;
}

export function recordAudiobookRetailPublicationRefresh(
  monitor: AudiobookRetailPublicationMonitor,
  verification: AudiobookRetailPublicationVerification,
  recordedAt = new Date(verification.verifiedAt),
): AudiobookRetailPublicationMonitor {
  assertAudiobookRetailPublicationMonitor(monitor);
  assertAudiobookRetailPublicationVerification(verification);
  if (
    verification.projectId !== monitor.projectId
    || verification.bookId !== monitor.bookId
    || verification.distributor !== monitor.distributor
    || verification.listingIdentity.id !== monitor.listingIdentity.id
    || verification.listingIdentity.fingerprint
      !== monitor.listingIdentity.fingerprint
    || stableHash(verification.requiredRegions)
      !== stableHash(monitor.requiredRegions)
  ) {
    throw new AudiobookRetailPublicationMonitorError(
      "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_SCOPE_MISMATCH",
    );
  }
  if (
    Number.isNaN(recordedAt.getTime())
    || recordedAt.getTime() < Date.parse(monitor.updatedAt)
    || Date.parse(verification.verifiedAt) <= Date.parse(monitor.lastVerifiedAt)
    || monitor.entries.some(
      (entry) => entry.verificationFingerprint === verification.fingerprint,
    )
  ) {
    throw new AudiobookRetailPublicationMonitorError(
      "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_REFRESH_ORDER_INVALID",
    );
  }
  if (monitor.entries.length >= MAXIMUM_ENTRIES) {
    throw new AudiobookRetailPublicationMonitorError(
      "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_ENTRY_LIMIT_REACHED",
    );
  }
  const entry = createEntry(verification, monitor.entries.length + 1);
  const kind = transitionKind(monitor.currentHealth, entry.health);
  const transition = createTransition({
    sequence: monitor.transitions.length + 1,
    kind,
    fromHealth: monitor.currentHealth,
    toHealth: entry.health,
    findingCodes: entry.findingCodes,
    occurredAt: recordedAt.toISOString(),
    evidenceFingerprint: entry.fingerprint,
  });
  return reviseMonitor(monitor, {
    entries: Object.freeze([...monitor.entries, entry]),
    transitions: Object.freeze([...monitor.transitions, transition]),
    currentHealth: entry.health,
    latestVerificationStatus: entry.verificationStatus,
    latestFindingCodes: entry.findingCodes,
    lastVerifiedAt: entry.verifiedAt,
    observationExpiresAt: entry.observationExpiresAt,
    nextRefreshDueAt: nextRefreshDueAt(
      entry.verifiedAt,
      entry.observationExpiresAt,
      monitor.refreshIntervalHours,
    ),
    updatedAt: recordedAt,
  });
}

export function markAudiobookRetailPublicationMonitorStale(
  monitor: AudiobookRetailPublicationMonitor,
  now = new Date(),
): AudiobookRetailPublicationMonitor {
  assertAudiobookRetailPublicationMonitor(monitor);
  if (Number.isNaN(now.getTime())) {
    throw new AudiobookRetailPublicationMonitorError(
      "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_DATE_INVALID",
    );
  }
  if (now.getTime() < Date.parse(monitor.nextRefreshDueAt)) {
    throw new AudiobookRetailPublicationMonitorError(
      "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_NOT_STALE",
    );
  }
  if (monitor.currentHealth === "stale") return monitor;
  const latest = monitor.entries.at(-1)!;
  const transition = createTransition({
    sequence: monitor.transitions.length + 1,
    kind: "stale",
    fromHealth: monitor.currentHealth,
    toHealth: "stale",
    findingCodes: Object.freeze([
      "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_REFRESH_OVERDUE",
    ]),
    occurredAt: now.toISOString(),
    evidenceFingerprint: latest.fingerprint,
  });
  return reviseMonitor(monitor, {
    transitions: Object.freeze([...monitor.transitions, transition]),
    currentHealth: "stale",
    latestVerificationStatus: monitor.latestVerificationStatus,
    latestFindingCodes: Object.freeze([
      ...new Set([
        ...monitor.latestFindingCodes,
        "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_REFRESH_OVERDUE",
      ]),
    ].sort((left, right) => left.localeCompare(right, "en-AU"))),
    lastVerifiedAt: monitor.lastVerifiedAt,
    observationExpiresAt: monitor.observationExpiresAt,
    nextRefreshDueAt: monitor.nextRefreshDueAt,
    updatedAt: now,
  });
}

export function assertAudiobookRetailPublicationMonitor(
  monitor: AudiobookRetailPublicationMonitor,
): void {
  if (
    monitor.schemaVersion !== AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_SCHEMA_VERSION
  ) {
    throw new AudiobookRetailPublicationMonitorError(
      "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_SCHEMA_UNSUPPORTED",
    );
  }
  for (const [value, code] of [
    [monitor.id, "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_ID_INVALID"],
    [monitor.projectId, "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_PROJECT_ID_INVALID"],
    [monitor.bookId, "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_BOOK_ID_INVALID"],
    [monitor.listingIdentity.id, "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_LISTING_ID_INVALID"],
  ] as const) requireIdentifier(value, code);
  requireHash(
    monitor.listingIdentity.fingerprint,
    "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_LISTING_HASH_INVALID",
  );
  if (monitor.distributor !== "acx-audible" || monitor.status !== "active") {
    throw new AudiobookRetailPublicationMonitorError(
      "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_STATE_INVALID",
    );
  }
  const regions = normaliseRegions(monitor.requiredRegions);
  if (stableHash(regions) !== stableHash(monitor.requiredRegions)) {
    throw new AudiobookRetailPublicationMonitorError(
      "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_REGIONS_INVALID",
    );
  }
  requireInteger(
    monitor.refreshIntervalHours,
    MINIMUM_REFRESH_INTERVAL_HOURS,
    MAXIMUM_REFRESH_INTERVAL_HOURS,
    "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_INTERVAL_INVALID",
  );
  if (
    !Array.isArray(monitor.entries)
    || monitor.entries.length === 0
    || monitor.entries.length > MAXIMUM_ENTRIES
    || !Array.isArray(monitor.transitions)
    || monitor.transitions.length === 0
    || monitor.transitions.length > MAXIMUM_TRANSITIONS
  ) {
    throw new AudiobookRetailPublicationMonitorError(
      "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_HISTORY_INVALID",
    );
  }
  let previousVerifiedAt = -Infinity;
  for (const [index, entry] of monitor.entries.entries()) {
    assertEntry(entry);
    if (
      entry.sequence !== index + 1
      || entry.listingIdentityId !== monitor.listingIdentity.id
      || entry.listingIdentityFingerprint
        !== monitor.listingIdentity.fingerprint
      || stableHash(entry.requiredRegions) !== stableHash(monitor.requiredRegions)
      || Date.parse(entry.verifiedAt) <= previousVerifiedAt
    ) {
      throw new AudiobookRetailPublicationMonitorError(
        "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_ENTRY_SCOPE_INVALID",
      );
    }
    previousVerifiedAt = Date.parse(entry.verifiedAt);
  }
  let previousTransitionAt = -Infinity;
  for (const [index, transition] of monitor.transitions.entries()) {
    assertTransition(transition);
    if (
      transition.sequence !== index + 1
      || Date.parse(transition.occurredAt) < previousTransitionAt
    ) {
      throw new AudiobookRetailPublicationMonitorError(
        "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_TRANSITION_ORDER_INVALID",
      );
    }
    previousTransitionAt = Date.parse(transition.occurredAt);
  }
  const latestEntry = monitor.entries.at(-1)!;
  const latestTransition = monitor.transitions.at(-1)!;
  if (
    latestEntry.verificationStatus !== monitor.latestVerificationStatus
    || latestEntry.verifiedAt !== monitor.lastVerifiedAt
    || latestEntry.observationExpiresAt !== monitor.observationExpiresAt
    || latestTransition.toHealth !== monitor.currentHealth
    || stableHash(monitor.latestFindingCodes)
      !== stableHash(
        monitor.currentHealth === "stale"
          ? [
              ...new Set([
                ...latestEntry.findingCodes,
                "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_REFRESH_OVERDUE",
              ]),
            ].sort((left, right) => left.localeCompare(right, "en-AU"))
          : latestEntry.findingCodes,
      )
  ) {
    throw new AudiobookRetailPublicationMonitorError(
      "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_CURRENT_STATE_INVALID",
    );
  }
  const expectedDue = nextRefreshDueAt(
    latestEntry.verifiedAt,
    latestEntry.observationExpiresAt,
    monitor.refreshIntervalHours,
  );
  if (monitor.nextRefreshDueAt !== expectedDue) {
    throw new AudiobookRetailPublicationMonitorError(
      "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_REFRESH_DUE_INVALID",
    );
  }
  for (const value of [
    monitor.lastVerifiedAt,
    monitor.observationExpiresAt,
    monitor.nextRefreshDueAt,
    monitor.createdAt,
    monitor.updatedAt,
  ]) {
    requireDate(value, "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_DATE_INVALID");
  }
  requireInteger(
    monitor.revision,
    1,
    Number.MAX_SAFE_INTEGER,
    "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_REVISION_INVALID",
  );
  if (
    Date.parse(monitor.updatedAt) < Date.parse(monitor.createdAt)
    || (monitor.revision === 1 && monitor.previousFingerprint !== undefined)
    || (
      monitor.revision > 1
      && !HASH_PATTERN.test(monitor.previousFingerprint ?? "")
    )
  ) {
    throw new AudiobookRetailPublicationMonitorError(
      "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_REVISION_CHAIN_INVALID",
    );
  }
  const { fingerprint, ...partial } = monitor;
  if (monitorFingerprint(partial) !== fingerprint) {
    throw new AudiobookRetailPublicationMonitorError(
      "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_FINGERPRINT_INVALID",
    );
  }
}

export function audiobookRetailPublicationMonitorPublicView(
  monitor: AudiobookRetailPublicationMonitor,
  now = new Date(),
): AudiobookRetailPublicationMonitorPublicView {
  assertAudiobookRetailPublicationMonitor(monitor);
  if (Number.isNaN(now.getTime())) {
    throw new AudiobookRetailPublicationMonitorError(
      "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_DATE_INVALID",
    );
  }
  const latestTransition = monitor.transitions.at(-1)!;
  return Object.freeze({
    id: monitor.id,
    bookId: monitor.bookId,
    distributor: "acx-audible",
    requiredRegions: monitor.requiredRegions,
    refreshIntervalHours: monitor.refreshIntervalHours,
    entryCount: monitor.entries.length,
    transitionCount: monitor.transitions.length,
    currentHealth: monitor.currentHealth,
    latestVerificationStatus: monitor.latestVerificationStatus,
    latestFindingCodes: monitor.latestFindingCodes,
    lastVerifiedAt: monitor.lastVerifiedAt,
    observationExpiresAt: monitor.observationExpiresAt,
    nextRefreshDueAt: monitor.nextRefreshDueAt,
    refreshDue: now.getTime() >= Date.parse(monitor.nextRefreshDueAt),
    latestTransition: Object.freeze({
      kind: latestTransition.kind,
      ...(latestTransition.fromHealth
        ? { fromHealth: latestTransition.fromHealth }
        : {}),
      toHealth: latestTransition.toHealth,
      occurredAt: latestTransition.occurredAt,
    }),
    revision: monitor.revision,
    createdAt: monitor.createdAt,
    updatedAt: monitor.updatedAt,
    fingerprint: monitor.fingerprint,
  });
}

function toEnvelope(
  envelope: StoredEnvelope<Record<string, unknown>>,
): StoredEnvelope<AudiobookRetailPublicationMonitor> {
  const monitor = envelope.payload
    as unknown as AudiobookRetailPublicationMonitor;
  assertAudiobookRetailPublicationMonitor(monitor);
  if (
    envelope.entityType !== AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_ENTITY_TYPE
    || envelope.entityId !== monitor.id
    || envelope.revision !== monitor.revision
  ) {
    throw new AudiobookRetailPublicationMonitorStoreConflictError(
      "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_STORE_ENVELOPE_SCOPE_MISMATCH",
    );
  }
  return envelope as unknown as StoredEnvelope<AudiobookRetailPublicationMonitor>;
}

export class FileAudiobookRetailPublicationMonitorStore {
  readonly #store: FileProjectStore;

  constructor(store: FileProjectStore) {
    this.#store = store;
  }

  async create(
    monitor: AudiobookRetailPublicationMonitor,
    actorId: string,
  ): Promise<StoredEnvelope<AudiobookRetailPublicationMonitor>> {
    assertAudiobookRetailPublicationMonitor(monitor);
    requireIdentifier(
      actorId,
      "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_STORE_ACTOR_INVALID",
    );
    const existing = await this.read(monitor.id);
    if (existing) {
      if (existing.payload.fingerprint === monitor.fingerprint) return existing;
      throw new AudiobookRetailPublicationMonitorStoreConflictError(
        "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_STORE_IDEMPOTENCY_CONFLICT",
      );
    }
    try {
      const envelope = toEnvelope(await this.#store.create(
        AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_ENTITY_TYPE,
        monitor.id,
        monitor as unknown as Record<string, unknown>,
        new Date(monitor.createdAt),
      ));
      await this.#audit(actorId, "audiobook_retail_publication_monitor.created", envelope);
      return envelope;
    } catch (error) {
      if (error instanceof StoreConflictError) {
        throw new AudiobookRetailPublicationMonitorStoreConflictError(error.message);
      }
      throw error;
    }
  }

  async read(
    monitorId: string,
  ): Promise<StoredEnvelope<AudiobookRetailPublicationMonitor> | null> {
    requireIdentifier(
      monitorId,
      "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_STORE_ID_INVALID",
    );
    const envelope = await this.#store.read<Record<string, unknown>>(
      AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_ENTITY_TYPE,
      monitorId,
    );
    return envelope ? toEnvelope(envelope) : null;
  }

  async require(
    monitorId: string,
  ): Promise<StoredEnvelope<AudiobookRetailPublicationMonitor>> {
    const envelope = await this.read(monitorId);
    if (!envelope) {
      throw new AudiobookRetailPublicationMonitorStoreConflictError(
        "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_STORE_NOT_FOUND",
      );
    }
    return envelope;
  }

  async save(
    monitor: AudiobookRetailPublicationMonitor,
    input: Readonly<{
      expectedRevision: number;
      actorId: string;
      action: string;
    }>,
  ): Promise<StoredEnvelope<AudiobookRetailPublicationMonitor>> {
    assertAudiobookRetailPublicationMonitor(monitor);
    requireIdentifier(
      input.actorId,
      "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_STORE_ACTOR_INVALID",
    );
    if (
      !/^audiobook_retail_publication_monitor\.[a-z][a-z0-9._-]{1,80}$/u.test(
        input.action,
      )
    ) {
      throw new AudiobookRetailPublicationMonitorStoreConflictError(
        "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_STORE_ACTION_INVALID",
      );
    }
    const current = await this.require(monitor.id);
    if (
      current.revision !== input.expectedRevision
      || monitor.revision !== current.payload.revision + 1
      || monitor.previousFingerprint !== current.payload.fingerprint
    ) {
      throw new AudiobookRetailPublicationMonitorStoreConflictError(
        "AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_STORE_REVISION_CONFLICT",
      );
    }
    try {
      const envelope = toEnvelope(await this.#store.replace(
        AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_ENTITY_TYPE,
        monitor.id,
        input.expectedRevision,
        monitor as unknown as Record<string, unknown>,
        new Date(monitor.updatedAt),
      ));
      await this.#audit(input.actorId, input.action, envelope);
      return envelope;
    } catch (error) {
      if (error instanceof StoreConflictError) {
        throw new AudiobookRetailPublicationMonitorStoreConflictError(error.message);
      }
      throw error;
    }
  }

  async #audit(
    actorId: string,
    action: string,
    envelope: StoredEnvelope<AudiobookRetailPublicationMonitor>,
  ): Promise<void> {
    const latest = envelope.payload.transitions.at(-1)!;
    await this.#store.appendAuditEvent({
      actorId,
      action,
      entityType: AUDIOBOOK_RETAIL_PUBLICATION_MONITOR_ENTITY_TYPE,
      entityId: envelope.entityId,
      revision: envelope.revision,
      occurredAt: new Date(envelope.savedAt),
      metadata: {
        currentHealth: envelope.payload.currentHealth,
        latestVerificationStatus:
          envelope.payload.latestVerificationStatus,
        entryCount: envelope.payload.entries.length,
        transitionCount: envelope.payload.transitions.length,
        latestTransitionKind: latest.kind,
        findingCount: envelope.payload.latestFindingCodes.length,
        requiredRegionCount: envelope.payload.requiredRegions.length,
        refreshIntervalHours: envelope.payload.refreshIntervalHours,
        refreshDue:
          Date.parse(envelope.payload.updatedAt)
            >= Date.parse(envelope.payload.nextRefreshDueAt),
      },
    });
  }
}
