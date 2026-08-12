import {
  audiobookRetailPublicationMonitorPublicView,
  assertAudiobookRetailPublicationMonitor,
  createAudiobookRetailPublicationMonitor,
  markAudiobookRetailPublicationMonitorStale,
  recordAudiobookRetailPublicationRefresh,
  type AudiobookRetailPublicationHealth,
  type AudiobookRetailPublicationMonitor,
} from "./audiobook-retail-publication-monitor.js";
import { stableHash } from "./index.js";
import {
  assertAdmittedNarratorRetailPublicationVerification,
  type AdmittedNarratorRetailPublicationVerification,
} from "./narrator-retail-publication-admission.js";
import {
  assertExactNarratorVoicePin,
  type PinnedNarratorVoice,
} from "./narrator-voice-profile.js";

export const ADMITTED_NARRATOR_RETAIL_PUBLICATION_MONITOR_SCHEMA =
  "storyteller-admitted-narrator-retail-publication-monitor-v1" as const;

export interface AdmittedNarratorRetailPublicationMonitor {
  schemaVersion: typeof ADMITTED_NARRATOR_RETAIL_PUBLICATION_MONITOR_SCHEMA;
  projectId: string;
  bookId: string;
  profileAdmissionHash: string;
  admittedCastingFingerprint: string;
  castingFingerprint: string;
  voice: PinnedNarratorVoice;
  audiobookAsin: string;
  admittedListingFingerprint: string;
  verifications: readonly AdmittedNarratorRetailPublicationVerification[];
  monitor: AudiobookRetailPublicationMonitor;
  totalProductionJobCount: number;
  narratorAdmissionComplete: true;
  syntheticNarrationDeclared: true;
  platformAuthorisationBound: true;
  retailerAcceptanceConfirmed: true;
  listingIdentityApproved: true;
  admittedListingIdentityBound: true;
  initialLivePublicationConfirmed: true;
  continuousNarratorLineageBound: true;
  admittedListingIdentityInvariant: true;
  monitorActive: true;
  staleEvidence: boolean;
  latestPublicationConfirmed: boolean;
  latestLiveConfirmed: boolean;
  latestPurchaseConfirmed: boolean;
  latestSamplePlaybackConfirmed: boolean;
  currentHealth: AudiobookRetailPublicationHealth;
  latestVerificationStatus:
    AdmittedNarratorRetailPublicationVerification["status"];
  automaticRemediationAuthority: false;
  automaticRepublishAuthority: false;
  publicationAuthority: false;
  updatedAt: string;
  fingerprint: string;
}

export interface AdmittedNarratorRetailPublicationMonitorPublicView {
  bookId: string;
  distributor: "acx-audible";
  marketplace: "audible";
  audiobookAsin: string;
  displayTitle: string;
  narratorCredit: string;
  requiredRegions: readonly string[];
  refreshIntervalHours: number;
  verificationCount: number;
  transitionCount: number;
  totalProductionJobCount: number;
  narratorAdmissionComplete: true;
  syntheticNarrationDeclared: true;
  platformAuthorisationBound: true;
  retailerAcceptanceConfirmed: true;
  listingIdentityApproved: true;
  admittedListingIdentityBound: true;
  initialLivePublicationConfirmed: true;
  continuousNarratorLineageBound: true;
  admittedListingIdentityInvariant: true;
  monitorActive: true;
  staleEvidence: boolean;
  latestPublicationConfirmed: boolean;
  latestLiveConfirmed: boolean;
  latestPurchaseConfirmed: boolean;
  latestSamplePlaybackConfirmed: boolean;
  currentHealth: AudiobookRetailPublicationHealth;
  latestVerificationStatus:
    AdmittedNarratorRetailPublicationVerification["status"];
  latestFindingCodes: readonly string[];
  nextRefreshDueAt: string;
  refreshDue: boolean;
  automaticRemediationAuthority: false;
  automaticRepublishAuthority: false;
  publicationAuthority: false;
  updatedAt: string;
  fingerprint: string;
}

export class AdmittedNarratorRetailPublicationMonitorError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "AdmittedNarratorRetailPublicationMonitorError";
    this.code = code;
  }
}

const HASH = /^[a-f0-9]{64}$/u;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const ASIN = /^[A-Z0-9]{10}$/u;

function requireHash(value: string, code: string): string {
  if (typeof value !== "string" || !HASH.test(value)) {
    throw new AdmittedNarratorRetailPublicationMonitorError(code);
  }
  return value;
}

function requireIdentifier(value: string, code: string): string {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    throw new AdmittedNarratorRetailPublicationMonitorError(code);
  }
  return value;
}

function requirePositiveInteger(value: number, code: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new AdmittedNarratorRetailPublicationMonitorError(code);
  }
  return value;
}

function requireDate(value: string, code: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new AdmittedNarratorRetailPublicationMonitorError(code);
  }
  return value;
}

function monitorBase(
  value: Omit<AdmittedNarratorRetailPublicationMonitor, "fingerprint">,
): Readonly<Record<string, unknown>> {
  return value;
}

function assertInitialLiveVerification(
  verification: AdmittedNarratorRetailPublicationVerification,
): void {
  assertAdmittedNarratorRetailPublicationVerification(verification);
  if (
    verification.status !== "published-and-live"
    || verification.publicationConfirmed !== true
    || verification.liveConfirmed !== true
    || verification.purchaseConfirmed !== true
    || verification.samplePlaybackConfirmed !== true
    || verification.verification.findingCodes.length !== 0
  ) {
    throw new AdmittedNarratorRetailPublicationMonitorError(
      "ADMITTED_NARRATOR_RETAIL_PUBLICATION_MONITOR_INITIAL_LIVE_REQUIRED",
    );
  }
}

function assertSameNarratorLineage(
  initial: AdmittedNarratorRetailPublicationVerification,
  candidate: AdmittedNarratorRetailPublicationVerification,
): void {
  assertAdmittedNarratorRetailPublicationVerification(initial);
  assertAdmittedNarratorRetailPublicationVerification(candidate);

  const initialListing = initial.observation.listing;
  const candidateListing = candidate.observation.listing;
  const initialObservation = initial.observation.observation;
  const candidateObservation = candidate.observation.observation;

  if (
    candidate.projectId !== initial.projectId
    || candidate.bookId !== initial.bookId
    || candidate.profileAdmissionHash !== initial.profileAdmissionHash
    || candidate.admittedCastingFingerprint
      !== initial.admittedCastingFingerprint
    || candidate.castingFingerprint !== initial.castingFingerprint
    || candidate.totalProductionJobCount !== initial.totalProductionJobCount
    || candidate.voice.profileId !== initial.voice.profileId
    || candidate.voice.revision !== initial.voice.revision
    || candidate.voice.profileHash !== initial.voice.profileHash
    || candidateListing.fingerprint !== initialListing.fingerprint
    || candidateListing.identity.id !== initialListing.identity.id
    || candidateListing.identity.fingerprint !== initialListing.identity.fingerprint
    || candidateListing.retailerStatus.fingerprint
      !== initialListing.retailerStatus.fingerprint
    || candidateListing.retailerStatus.evidence.fingerprint
      !== initialListing.retailerStatus.evidence.fingerprint
    || candidateObservation.audiobookAsin !== initialObservation.audiobookAsin
  ) {
    throw new AdmittedNarratorRetailPublicationMonitorError(
      "ADMITTED_NARRATOR_RETAIL_PUBLICATION_MONITOR_NARRATOR_LINEAGE_MISMATCH",
    );
  }

  assertExactNarratorVoicePin(initial.voice, candidate.voice);
}

function assertEntryMatchesVerification(
  entry: AudiobookRetailPublicationMonitor["entries"][number],
  verification: AdmittedNarratorRetailPublicationVerification,
): void {
  const generic = verification.verification;
  const observation = verification.observation.observation;
  if (
    entry.verificationId !== generic.id
    || entry.verificationFingerprint !== generic.fingerprint
    || entry.listingIdentityId !== generic.listingIdentity.id
    || entry.listingIdentityFingerprint !== generic.listingIdentity.fingerprint
    || entry.observationFingerprint !== generic.observation.fingerprint
    || stableHash(entry.requiredRegions) !== stableHash(generic.requiredRegions)
    || entry.verificationStatus !== generic.status
    || entry.retailerAcceptanceConfirmed !== true
    || entry.publicationConfirmed !== generic.publicationConfirmed
    || entry.liveConfirmed !== generic.liveConfirmed
    || entry.purchaseConfirmed !== generic.purchaseConfirmed
    || entry.samplePlaybackConfirmed !== generic.samplePlaybackConfirmed
    || stableHash(entry.findingCodes) !== stableHash(generic.findingCodes)
    || entry.verifiedAt !== generic.verifiedAt
    || entry.observationExpiresAt !== observation.expiresAt
  ) {
    throw new AdmittedNarratorRetailPublicationMonitorError(
      "ADMITTED_NARRATOR_RETAIL_PUBLICATION_MONITOR_ENTRY_LINEAGE_MISMATCH",
    );
  }
}

function buildMonitorValue(
  verifications: readonly AdmittedNarratorRetailPublicationVerification[],
  monitor: AudiobookRetailPublicationMonitor,
): AdmittedNarratorRetailPublicationMonitor {
  if (verifications.length === 0) {
    throw new AdmittedNarratorRetailPublicationMonitorError(
      "ADMITTED_NARRATOR_RETAIL_PUBLICATION_MONITOR_VERIFICATIONS_REQUIRED",
    );
  }
  const initial = verifications[0]!;
  const latest = verifications.at(-1)!;
  const listing = initial.observation.listing;
  const latestEntry = monitor.entries.at(-1)!;
  const partial: Omit<
    AdmittedNarratorRetailPublicationMonitor,
    "fingerprint"
  > = {
    schemaVersion: ADMITTED_NARRATOR_RETAIL_PUBLICATION_MONITOR_SCHEMA,
    projectId: initial.projectId,
    bookId: initial.bookId,
    profileAdmissionHash: initial.profileAdmissionHash,
    admittedCastingFingerprint: initial.admittedCastingFingerprint,
    castingFingerprint: initial.castingFingerprint,
    voice: Object.freeze({ ...initial.voice }),
    audiobookAsin: initial.observation.observation.audiobookAsin,
    admittedListingFingerprint: listing.fingerprint,
    verifications: Object.freeze([...verifications]),
    monitor,
    totalProductionJobCount: initial.totalProductionJobCount,
    narratorAdmissionComplete: true,
    syntheticNarrationDeclared: true,
    platformAuthorisationBound: true,
    retailerAcceptanceConfirmed: true,
    listingIdentityApproved: true,
    admittedListingIdentityBound: true,
    initialLivePublicationConfirmed: true,
    continuousNarratorLineageBound: true,
    admittedListingIdentityInvariant: true,
    monitorActive: true,
    staleEvidence: monitor.currentHealth === "stale",
    latestPublicationConfirmed: latestEntry.publicationConfirmed,
    latestLiveConfirmed: latestEntry.liveConfirmed,
    latestPurchaseConfirmed: latestEntry.purchaseConfirmed,
    latestSamplePlaybackConfirmed: latestEntry.samplePlaybackConfirmed,
    currentHealth: monitor.currentHealth,
    latestVerificationStatus: monitor.latestVerificationStatus,
    automaticRemediationAuthority: false,
    automaticRepublishAuthority: false,
    publicationAuthority: false,
    updatedAt: monitor.updatedAt,
  };
  const value = Object.freeze({
    ...partial,
    fingerprint: stableHash(monitorBase(partial)),
  });
  assertAdmittedNarratorRetailPublicationMonitor(value);
  return value;
}

function assertMonitorLineage(
  value: AdmittedNarratorRetailPublicationMonitor,
): void {
  assertAudiobookRetailPublicationMonitor(value.monitor);
  if (
    !Array.isArray(value.verifications)
    || value.verifications.length === 0
    || value.verifications.length !== value.monitor.entries.length
  ) {
    throw new AdmittedNarratorRetailPublicationMonitorError(
      "ADMITTED_NARRATOR_RETAIL_PUBLICATION_MONITOR_HISTORY_MISMATCH",
    );
  }
  const initial = value.verifications[0]!;
  const latest = value.verifications.at(-1)!;
  const latestEntry = value.monitor.entries.at(-1)!;
  assertInitialLiveVerification(initial);
  assertExactNarratorVoicePin(initial.voice, value.voice);

  for (const [index, verification] of value.verifications.entries()) {
    assertSameNarratorLineage(initial, verification);
    assertEntryMatchesVerification(value.monitor.entries[index]!, verification);
  }

  const listing = initial.observation.listing;
  if (
    value.projectId !== initial.projectId
    || value.bookId !== initial.bookId
    || value.profileAdmissionHash !== initial.profileAdmissionHash
    || value.admittedCastingFingerprint !== initial.admittedCastingFingerprint
    || value.castingFingerprint !== initial.castingFingerprint
    || value.audiobookAsin !== initial.observation.observation.audiobookAsin
    || value.admittedListingFingerprint !== listing.fingerprint
    || value.monitor.projectId !== initial.projectId
    || value.monitor.bookId !== initial.bookId
    || value.monitor.distributor !== initial.verification.distributor
    || value.monitor.listingIdentity.id !== listing.identity.id
    || value.monitor.listingIdentity.fingerprint !== listing.identity.fingerprint
    || value.totalProductionJobCount !== initial.totalProductionJobCount
    || value.staleEvidence !== (value.monitor.currentHealth === "stale")
    || value.latestPublicationConfirmed !== latestEntry.publicationConfirmed
    || value.latestLiveConfirmed !== latestEntry.liveConfirmed
    || value.latestPurchaseConfirmed !== latestEntry.purchaseConfirmed
    || value.latestSamplePlaybackConfirmed
      !== latestEntry.samplePlaybackConfirmed
    || value.currentHealth !== value.monitor.currentHealth
    || value.latestVerificationStatus !== latest.status
    || value.latestVerificationStatus !== value.monitor.latestVerificationStatus
    || value.updatedAt !== value.monitor.updatedAt
  ) {
    throw new AdmittedNarratorRetailPublicationMonitorError(
      "ADMITTED_NARRATOR_RETAIL_PUBLICATION_MONITOR_LINEAGE_MISMATCH",
    );
  }

  if (
    value.narratorAdmissionComplete !== true
    || value.syntheticNarrationDeclared !== true
    || value.platformAuthorisationBound !== true
    || value.retailerAcceptanceConfirmed !== true
    || value.listingIdentityApproved !== true
    || value.admittedListingIdentityBound !== true
    || value.initialLivePublicationConfirmed !== true
    || value.continuousNarratorLineageBound !== true
    || value.admittedListingIdentityInvariant !== true
    || value.monitorActive !== true
    || value.automaticRemediationAuthority !== false
    || value.automaticRepublishAuthority !== false
    || value.publicationAuthority !== false
  ) {
    throw new AdmittedNarratorRetailPublicationMonitorError(
      "ADMITTED_NARRATOR_RETAIL_PUBLICATION_MONITOR_AUTHORITY_INVALID",
    );
  }
}

export function createAdmittedNarratorRetailPublicationMonitor(input: Readonly<{
  id: string;
  verification: AdmittedNarratorRetailPublicationVerification;
  refreshIntervalHours?: number;
  createdAt?: Date;
}>): AdmittedNarratorRetailPublicationMonitor {
  assertInitialLiveVerification(input.verification);
  const monitor = createAudiobookRetailPublicationMonitor({
    id: input.id,
    verification: input.verification.verification,
    ...(input.refreshIntervalHours !== undefined
      ? { refreshIntervalHours: input.refreshIntervalHours }
      : {}),
    ...(input.createdAt ? { createdAt: input.createdAt } : {}),
  });
  return buildMonitorValue(Object.freeze([input.verification]), monitor);
}

export function recordAdmittedNarratorRetailPublicationRefresh(
  value: AdmittedNarratorRetailPublicationMonitor,
  verification: AdmittedNarratorRetailPublicationVerification,
  recordedAt = new Date(verification.verifiedAt),
): AdmittedNarratorRetailPublicationMonitor {
  assertAdmittedNarratorRetailPublicationMonitor(value);
  const initial = value.verifications[0]!;
  assertSameNarratorLineage(initial, verification);
  const monitor = recordAudiobookRetailPublicationRefresh(
    value.monitor,
    verification.verification,
    recordedAt,
  );
  return buildMonitorValue(
    Object.freeze([...value.verifications, verification]),
    monitor,
  );
}

export function markAdmittedNarratorRetailPublicationMonitorStale(
  value: AdmittedNarratorRetailPublicationMonitor,
  now = new Date(),
): AdmittedNarratorRetailPublicationMonitor {
  assertAdmittedNarratorRetailPublicationMonitor(value);
  const monitor = markAudiobookRetailPublicationMonitorStale(value.monitor, now);
  return buildMonitorValue(value.verifications, monitor);
}

export function assertAdmittedNarratorRetailPublicationMonitor(
  value: AdmittedNarratorRetailPublicationMonitor,
): void {
  if (
    value.schemaVersion !== ADMITTED_NARRATOR_RETAIL_PUBLICATION_MONITOR_SCHEMA
  ) {
    throw new AdmittedNarratorRetailPublicationMonitorError(
      "ADMITTED_NARRATOR_RETAIL_PUBLICATION_MONITOR_SCHEMA_UNSUPPORTED",
    );
  }
  requireIdentifier(
    value.projectId,
    "ADMITTED_NARRATOR_RETAIL_PUBLICATION_MONITOR_PROJECT_INVALID",
  );
  requireIdentifier(
    value.bookId,
    "ADMITTED_NARRATOR_RETAIL_PUBLICATION_MONITOR_BOOK_INVALID",
  );
  if (!ASIN.test(value.audiobookAsin)) {
    throw new AdmittedNarratorRetailPublicationMonitorError(
      "ADMITTED_NARRATOR_RETAIL_PUBLICATION_MONITOR_ASIN_INVALID",
    );
  }
  for (const hash of [
    value.profileAdmissionHash,
    value.admittedCastingFingerprint,
    value.castingFingerprint,
    value.admittedListingFingerprint,
  ]) {
    requireHash(
      hash,
      "ADMITTED_NARRATOR_RETAIL_PUBLICATION_MONITOR_HASH_INVALID",
    );
  }
  requirePositiveInteger(
    value.totalProductionJobCount,
    "ADMITTED_NARRATOR_RETAIL_PUBLICATION_MONITOR_JOB_COUNT_INVALID",
  );
  requireDate(
    value.updatedAt,
    "ADMITTED_NARRATOR_RETAIL_PUBLICATION_MONITOR_DATE_INVALID",
  );
  assertMonitorLineage(value);
  const { fingerprint, ...partial } = value;
  if (
    !HASH.test(fingerprint)
    || fingerprint !== stableHash(monitorBase(partial))
  ) {
    throw new AdmittedNarratorRetailPublicationMonitorError(
      "ADMITTED_NARRATOR_RETAIL_PUBLICATION_MONITOR_FINGERPRINT_INVALID",
    );
  }
}

export function admittedNarratorRetailPublicationMonitorPublicView(
  value: AdmittedNarratorRetailPublicationMonitor,
  now = new Date(),
): AdmittedNarratorRetailPublicationMonitorPublicView {
  assertAdmittedNarratorRetailPublicationMonitor(value);
  const generic = audiobookRetailPublicationMonitorPublicView(
    value.monitor,
    now,
  );
  const listing = value.verifications[0]!.observation.listing.identity;
  return Object.freeze({
    bookId: value.bookId,
    distributor: generic.distributor,
    marketplace: "audible",
    audiobookAsin: value.audiobookAsin,
    displayTitle: listing.metadata.displayTitle,
    narratorCredit: listing.metadata.narratorCredit,
    requiredRegions: generic.requiredRegions,
    refreshIntervalHours: generic.refreshIntervalHours,
    verificationCount: value.verifications.length,
    transitionCount: generic.transitionCount,
    totalProductionJobCount: value.totalProductionJobCount,
    narratorAdmissionComplete: true,
    syntheticNarrationDeclared: true,
    platformAuthorisationBound: true,
    retailerAcceptanceConfirmed: true,
    listingIdentityApproved: true,
    admittedListingIdentityBound: true,
    initialLivePublicationConfirmed: true,
    continuousNarratorLineageBound: true,
    admittedListingIdentityInvariant: true,
    monitorActive: true,
    staleEvidence: value.staleEvidence,
    latestPublicationConfirmed: value.latestPublicationConfirmed,
    latestLiveConfirmed: value.latestLiveConfirmed,
    latestPurchaseConfirmed: value.latestPurchaseConfirmed,
    latestSamplePlaybackConfirmed: value.latestSamplePlaybackConfirmed,
    currentHealth: generic.currentHealth,
    latestVerificationStatus: generic.latestVerificationStatus,
    latestFindingCodes: generic.latestFindingCodes,
    nextRefreshDueAt: generic.nextRefreshDueAt,
    refreshDue: generic.refreshDue,
    automaticRemediationAuthority: false,
    automaticRepublishAuthority: false,
    publicationAuthority: false,
    updatedAt: value.updatedAt,
    fingerprint: value.fingerprint,
  });
}
