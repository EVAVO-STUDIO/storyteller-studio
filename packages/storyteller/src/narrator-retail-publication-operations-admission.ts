import {
  acknowledgeAudiobookRetailPublicationEvidence,
  assertAudiobookRetailPublicationEvidenceInboxItem,
  assertAudiobookRetailPublicationEvidenceRequest,
  createAudiobookRetailPublicationEvidenceRequest,
  submitAudiobookRetailPublicationEvidence,
  type AudiobookRetailPublicationEvidenceInboxItem,
  type AudiobookRetailPublicationEvidenceRequest,
} from "./audiobook-retail-publication-evidence-inbox.js";
import {
  assertAudiobookRetailPublicationAlert,
  assertAudiobookRetailPublicationAlertMatchesMonitor,
  audiobookRetailPublicationAlertPublicView,
  createAudiobookRetailPublicationAlert,
  resolveAudiobookRetailPublicationAlert,
  type AudiobookRetailPublicationAlert,
  type AudiobookRetailPublicationAlertCategory,
  type AudiobookRetailPublicationAlertSeverity,
  type AudiobookRetailPublicationAlertStatus,
} from "./audiobook-retail-publication-alert.js";
import { stableHash } from "./index.js";
import {
  assertAdmittedNarratorRetailPublicationVerification,
  type AdmittedNarratorRetailPublicationVerification,
} from "./narrator-retail-publication-admission.js";
import {
  admittedNarratorRetailPublicationMonitorPublicView,
  assertAdmittedNarratorRetailPublicationMonitor,
  markAdmittedNarratorRetailPublicationMonitorStale,
  recordAdmittedNarratorRetailPublicationRefresh,
  type AdmittedNarratorRetailPublicationMonitor,
} from "./narrator-retail-publication-monitor-admission.js";
import { assertExactNarratorVoicePin } from "./narrator-voice-profile.js";

export const ADMITTED_NARRATOR_RETAIL_PUBLICATION_EVIDENCE_REQUEST_SCHEMA =
  "storyteller-admitted-narrator-retail-publication-evidence-request-v1" as const;
export const ADMITTED_NARRATOR_RETAIL_PUBLICATION_EVIDENCE_SCHEMA =
  "storyteller-admitted-narrator-retail-publication-evidence-v1" as const;
export const ADMITTED_NARRATOR_RETAIL_PUBLICATION_INCIDENT_SCHEMA =
  "storyteller-admitted-narrator-retail-publication-incident-v1" as const;
export const ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATION_SCHEMA =
  "storyteller-admitted-narrator-retail-publication-operation-v1" as const;

export interface AdmittedNarratorRetailPublicationEvidenceRequest {
  schemaVersion:
    typeof ADMITTED_NARRATOR_RETAIL_PUBLICATION_EVIDENCE_REQUEST_SCHEMA;
  monitor: AdmittedNarratorRetailPublicationMonitor;
  request: AudiobookRetailPublicationEvidenceRequest;
  narratorAdmissionComplete: true;
  admittedListingIdentityBound: true;
  narratorLineageBound: true;
  publicProductIdentityBound: true;
  evidenceAcquisitionRequested: true;
  automaticRefreshAuthority: false;
  automaticRemediationAuthority: false;
  automaticRepublishAuthority: false;
  publicationAuthority: false;
  requestedAt: string;
  fingerprint: string;
}

export interface AdmittedNarratorRetailPublicationEvidence {
  schemaVersion: typeof ADMITTED_NARRATOR_RETAIL_PUBLICATION_EVIDENCE_SCHEMA;
  request: AdmittedNarratorRetailPublicationEvidenceRequest;
  verification: AdmittedNarratorRetailPublicationVerification;
  inboxItem: AudiobookRetailPublicationEvidenceInboxItem;
  narratorAdmissionComplete: true;
  admittedListingIdentityBound: true;
  narratorLineageBound: true;
  publicProductIdentityBound: true;
  evidenceAvailable: true;
  refreshEligible: true;
  automaticRefreshAuthority: false;
  automaticRemediationAuthority: false;
  automaticRepublishAuthority: false;
  publicationAuthority: false;
  receivedAt: string;
  fingerprint: string;
}

export interface AdmittedNarratorRetailPublicationIncident {
  schemaVersion: typeof ADMITTED_NARRATOR_RETAIL_PUBLICATION_INCIDENT_SCHEMA;
  triggerMonitor: AdmittedNarratorRetailPublicationMonitor;
  alert: AudiobookRetailPublicationAlert;
  recoveryMonitor?: AdmittedNarratorRetailPublicationMonitor;
  narratorAdmissionComplete: true;
  admittedListingIdentityBound: true;
  narratorLineageBound: true;
  publicProductIdentityBound: true;
  verifiedRecoveryRequired: true;
  automaticRefreshAuthority: false;
  automaticRemediationAuthority: false;
  automaticRepublishAuthority: false;
  publicationAuthority: false;
  status: AudiobookRetailPublicationAlertStatus;
  updatedAt: string;
  fingerprint: string;
}

export type AdmittedNarratorRetailPublicationOperationKind =
  | "evidence-refresh"
  | "evidence-stale";

export interface AdmittedNarratorRetailPublicationOperation {
  schemaVersion: typeof ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATION_SCHEMA;
  kind: AdmittedNarratorRetailPublicationOperationKind;
  previousMonitor: AdmittedNarratorRetailPublicationMonitor;
  monitor: AdmittedNarratorRetailPublicationMonitor;
  evidence?: AdmittedNarratorRetailPublicationEvidence;
  acknowledgedEvidence?: AudiobookRetailPublicationEvidenceInboxItem;
  incident?: AdmittedNarratorRetailPublicationIncident;
  narratorAdmissionComplete: true;
  admittedListingIdentityBound: true;
  narratorLineageBound: true;
  publicProductIdentityBound: true;
  evidenceAcknowledged: boolean;
  incidentCreated: boolean;
  automaticRefreshAuthority: false;
  automaticRemediationAuthority: false;
  automaticRepublishAuthority: false;
  publicationAuthority: false;
  occurredAt: string;
  fingerprint: string;
}

export interface AdmittedNarratorRetailPublicationEvidenceRequestPublicView {
  bookId: string;
  distributor: "acx-audible";
  marketplace: "audible";
  audiobookAsin: string;
  displayTitle: string;
  narratorCredit: string;
  expectedMonitorRevision: number;
  currentHealth: AdmittedNarratorRetailPublicationMonitor["currentHealth"];
  requiredRegions: readonly string[];
  nextRefreshDueAt: string;
  narratorAdmissionComplete: true;
  admittedListingIdentityBound: true;
  narratorLineageBound: true;
  publicProductIdentityBound: true;
  evidenceAcquisitionRequested: true;
  automaticRefreshAuthority: false;
  automaticRemediationAuthority: false;
  automaticRepublishAuthority: false;
  publicationAuthority: false;
  requestedAt: string;
  fingerprint: string;
}

export interface AdmittedNarratorRetailPublicationEvidencePublicView {
  bookId: string;
  distributor: "acx-audible";
  marketplace: "audible";
  audiobookAsin: string;
  displayTitle: string;
  narratorCredit: string;
  expectedMonitorRevision: number;
  verificationStatus: AdmittedNarratorRetailPublicationVerification["status"];
  verificationVerifiedAt: string;
  observationExpiresAt: string;
  narratorAdmissionComplete: true;
  admittedListingIdentityBound: true;
  narratorLineageBound: true;
  publicProductIdentityBound: true;
  evidenceAvailable: true;
  refreshEligible: true;
  automaticRefreshAuthority: false;
  automaticRemediationAuthority: false;
  automaticRepublishAuthority: false;
  publicationAuthority: false;
  receivedAt: string;
  fingerprint: string;
}

export interface AdmittedNarratorRetailPublicationIncidentPublicView {
  bookId: string;
  distributor: "acx-audible";
  marketplace: "audible";
  audiobookAsin: string;
  displayTitle: string;
  narratorCredit: string;
  category: AudiobookRetailPublicationAlertCategory;
  severity: AudiobookRetailPublicationAlertSeverity;
  currentHealth: Exclude<
    AdmittedNarratorRetailPublicationMonitor["currentHealth"],
    "healthy-live"
  >;
  findingCodes: readonly string[];
  notificationDeliveryStatus:
    AudiobookRetailPublicationAlert["notification"]["deliveryStatus"];
  notificationAttemptCount: number;
  status: AudiobookRetailPublicationAlertStatus;
  resolvedAt?: string;
  narratorAdmissionComplete: true;
  admittedListingIdentityBound: true;
  narratorLineageBound: true;
  publicProductIdentityBound: true;
  verifiedRecoveryRequired: true;
  automaticRefreshAuthority: false;
  automaticRemediationAuthority: false;
  automaticRepublishAuthority: false;
  publicationAuthority: false;
  updatedAt: string;
  fingerprint: string;
}

export interface AdmittedNarratorRetailPublicationOperationPublicView {
  bookId: string;
  distributor: "acx-audible";
  marketplace: "audible";
  audiobookAsin: string;
  displayTitle: string;
  narratorCredit: string;
  kind: AdmittedNarratorRetailPublicationOperationKind;
  currentHealth: AdmittedNarratorRetailPublicationMonitor["currentHealth"];
  transitionKind:
    AdmittedNarratorRetailPublicationMonitor["monitor"]["transitions"][number]["kind"];
  latestVerificationStatus:
    AdmittedNarratorRetailPublicationMonitor["latestVerificationStatus"];
  evidenceAcknowledged: boolean;
  incidentCreated: boolean;
  incidentCategory?: AudiobookRetailPublicationAlertCategory;
  incidentSeverity?: AudiobookRetailPublicationAlertSeverity;
  narratorAdmissionComplete: true;
  admittedListingIdentityBound: true;
  narratorLineageBound: true;
  publicProductIdentityBound: true;
  automaticRefreshAuthority: false;
  automaticRemediationAuthority: false;
  automaticRepublishAuthority: false;
  publicationAuthority: false;
  occurredAt: string;
  fingerprint: string;
}

export class AdmittedNarratorRetailPublicationOperationsError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "AdmittedNarratorRetailPublicationOperationsError";
    this.code = code;
  }
}

const HASH = /^[a-f0-9]{64}$/u;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;

function requireHash(value: string, code: string): string {
  if (typeof value !== "string" || !HASH.test(value)) {
    throw new AdmittedNarratorRetailPublicationOperationsError(code);
  }
  return value;
}

function requireIdentifier(value: string, code: string): string {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    throw new AdmittedNarratorRetailPublicationOperationsError(code);
  }
  return value;
}

function requireDate(value: string, code: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new AdmittedNarratorRetailPublicationOperationsError(code);
  }
  return value;
}

function requestBase(
  value: Omit<AdmittedNarratorRetailPublicationEvidenceRequest, "fingerprint">,
): Readonly<Record<string, unknown>> {
  return value;
}

function evidenceBase(
  value: Omit<AdmittedNarratorRetailPublicationEvidence, "fingerprint">,
): Readonly<Record<string, unknown>> {
  return value;
}

function incidentBase(
  value: Omit<AdmittedNarratorRetailPublicationIncident, "fingerprint">,
): Readonly<Record<string, unknown>> {
  return value;
}

function operationBase(
  value: Omit<AdmittedNarratorRetailPublicationOperation, "fingerprint">,
): Readonly<Record<string, unknown>> {
  return value;
}

function listingMetadata(
  monitor: AdmittedNarratorRetailPublicationMonitor,
): Readonly<{
  displayTitle: string;
  narratorCredit: string;
}> {
  return monitor.verifications[0]!.observation.listing.identity.metadata;
}

function assertAuthorityFlags(
  value: Readonly<{
    narratorAdmissionComplete: true;
    admittedListingIdentityBound: true;
    narratorLineageBound: true;
    publicProductIdentityBound: true;
    automaticRefreshAuthority: false;
    automaticRemediationAuthority: false;
    automaticRepublishAuthority: false;
    publicationAuthority: false;
  }>,
  code: string,
): void {
  if (
    value.narratorAdmissionComplete !== true
    || value.admittedListingIdentityBound !== true
    || value.narratorLineageBound !== true
    || value.publicProductIdentityBound !== true
    || value.automaticRefreshAuthority !== false
    || value.automaticRemediationAuthority !== false
    || value.automaticRepublishAuthority !== false
    || value.publicationAuthority !== false
  ) {
    throw new AdmittedNarratorRetailPublicationOperationsError(code);
  }
}

function assertSameNarratorMonitorLineage(
  initial: AdmittedNarratorRetailPublicationMonitor,
  candidate: AdmittedNarratorRetailPublicationMonitor,
): void {
  assertAdmittedNarratorRetailPublicationMonitor(initial);
  assertAdmittedNarratorRetailPublicationMonitor(candidate);
  if (
    initial.projectId !== candidate.projectId
    || initial.bookId !== candidate.bookId
    || initial.profileAdmissionHash !== candidate.profileAdmissionHash
    || initial.admittedCastingFingerprint
      !== candidate.admittedCastingFingerprint
    || initial.castingFingerprint !== candidate.castingFingerprint
    || initial.voice.profileId !== candidate.voice.profileId
    || initial.voice.revision !== candidate.voice.revision
    || initial.voice.profileHash !== candidate.voice.profileHash
    || initial.audiobookAsin !== candidate.audiobookAsin
    || initial.admittedListingFingerprint
      !== candidate.admittedListingFingerprint
    || initial.totalProductionJobCount !== candidate.totalProductionJobCount
    || initial.monitor.id !== candidate.monitor.id
    || initial.monitor.projectId !== candidate.monitor.projectId
    || initial.monitor.bookId !== candidate.monitor.bookId
    || initial.monitor.distributor !== candidate.monitor.distributor
    || initial.monitor.listingIdentity.id
      !== candidate.monitor.listingIdentity.id
    || initial.monitor.listingIdentity.fingerprint
      !== candidate.monitor.listingIdentity.fingerprint
    || stableHash(initial.monitor.requiredRegions)
      !== stableHash(candidate.monitor.requiredRegions)
  ) {
    throw new AdmittedNarratorRetailPublicationOperationsError(
      "ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATIONS_NARRATOR_LINEAGE_MISMATCH",
    );
  }
  assertExactNarratorVoicePin(initial.voice, candidate.voice);
}

function assertVerificationLineage(
  monitor: AdmittedNarratorRetailPublicationMonitor,
  verification: AdmittedNarratorRetailPublicationVerification,
): void {
  assertAdmittedNarratorRetailPublicationMonitor(monitor);
  assertAdmittedNarratorRetailPublicationVerification(verification);
  const listing = verification.observation.listing;
  const observation = verification.observation.observation;
  if (
    monitor.projectId !== verification.projectId
    || monitor.bookId !== verification.bookId
    || monitor.profileAdmissionHash !== verification.profileAdmissionHash
    || monitor.admittedCastingFingerprint
      !== verification.admittedCastingFingerprint
    || monitor.castingFingerprint !== verification.castingFingerprint
    || monitor.voice.profileId !== verification.voice.profileId
    || monitor.voice.revision !== verification.voice.revision
    || monitor.voice.profileHash !== verification.voice.profileHash
    || monitor.audiobookAsin !== observation.audiobookAsin
    || monitor.admittedListingFingerprint !== listing.fingerprint
    || monitor.totalProductionJobCount !== verification.totalProductionJobCount
    || monitor.monitor.listingIdentity.id !== listing.identity.id
    || monitor.monitor.listingIdentity.fingerprint
      !== listing.identity.fingerprint
    || monitor.monitor.listingIdentity.id
      !== verification.verification.listingIdentity.id
    || monitor.monitor.listingIdentity.fingerprint
      !== verification.verification.listingIdentity.fingerprint
    || stableHash(monitor.monitor.requiredRegions)
      !== stableHash(verification.verification.requiredRegions)
  ) {
    throw new AdmittedNarratorRetailPublicationOperationsError(
      "ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATIONS_EVIDENCE_LINEAGE_MISMATCH",
    );
  }
  assertExactNarratorVoicePin(monitor.voice, verification.voice);
}

function isActionableMonitor(
  monitor: AdmittedNarratorRetailPublicationMonitor,
): boolean {
  const transition = monitor.monitor.transitions.at(-1)!;
  return (
    monitor.currentHealth !== "healthy-live"
    && transition.kind !== "refresh"
    && transition.kind !== "recovery"
  );
}

export function createAdmittedNarratorRetailPublicationEvidenceRequest(
  monitor: AdmittedNarratorRetailPublicationMonitor,
  requestedAt = new Date(),
): AdmittedNarratorRetailPublicationEvidenceRequest {
  assertAdmittedNarratorRetailPublicationMonitor(monitor);
  const request = createAudiobookRetailPublicationEvidenceRequest(
    monitor.monitor,
    requestedAt,
  );
  const partial: Omit<
    AdmittedNarratorRetailPublicationEvidenceRequest,
    "fingerprint"
  > = {
    schemaVersion:
      ADMITTED_NARRATOR_RETAIL_PUBLICATION_EVIDENCE_REQUEST_SCHEMA,
    monitor,
    request,
    narratorAdmissionComplete: true,
    admittedListingIdentityBound: true,
    narratorLineageBound: true,
    publicProductIdentityBound: true,
    evidenceAcquisitionRequested: true,
    automaticRefreshAuthority: false,
    automaticRemediationAuthority: false,
    automaticRepublishAuthority: false,
    publicationAuthority: false,
    requestedAt: request.requestedAt,
  };
  const value = Object.freeze({
    ...partial,
    fingerprint: stableHash(requestBase(partial)),
  });
  assertAdmittedNarratorRetailPublicationEvidenceRequest(value);
  return value;
}

export function assertAdmittedNarratorRetailPublicationEvidenceRequest(
  value: AdmittedNarratorRetailPublicationEvidenceRequest,
): void {
  if (
    value.schemaVersion
      !== ADMITTED_NARRATOR_RETAIL_PUBLICATION_EVIDENCE_REQUEST_SCHEMA
  ) {
    throw new AdmittedNarratorRetailPublicationOperationsError(
      "ADMITTED_NARRATOR_RETAIL_PUBLICATION_EVIDENCE_REQUEST_SCHEMA_UNSUPPORTED",
    );
  }
  assertAdmittedNarratorRetailPublicationMonitor(value.monitor);
  assertAudiobookRetailPublicationEvidenceRequest(value.request);
  const monitor = value.monitor.monitor;
  const request = value.request;
  const latestEntry = monitor.entries.at(-1)!;
  if (
    request.projectId !== value.monitor.projectId
    || request.bookId !== value.monitor.bookId
    || request.monitor.id !== monitor.id
    || request.monitor.revision !== monitor.revision
    || request.monitor.fingerprint !== monitor.fingerprint
    || request.monitor.listingIdentityId !== monitor.listingIdentity.id
    || request.monitor.listingIdentityFingerprint
      !== monitor.listingIdentity.fingerprint
    || request.monitor.latestVerificationFingerprint
      !== latestEntry.verificationFingerprint
    || request.monitor.lastVerifiedAt !== monitor.lastVerifiedAt
    || request.monitor.nextRefreshDueAt !== monitor.nextRefreshDueAt
    || stableHash(request.requiredRegions)
      !== stableHash(monitor.requiredRegions)
    || value.requestedAt !== request.requestedAt
  ) {
    throw new AdmittedNarratorRetailPublicationOperationsError(
      "ADMITTED_NARRATOR_RETAIL_PUBLICATION_EVIDENCE_REQUEST_LINEAGE_MISMATCH",
    );
  }
  requireDate(
    value.requestedAt,
    "ADMITTED_NARRATOR_RETAIL_PUBLICATION_EVIDENCE_REQUEST_DATE_INVALID",
  );
  if (value.evidenceAcquisitionRequested !== true) {
    throw new AdmittedNarratorRetailPublicationOperationsError(
      "ADMITTED_NARRATOR_RETAIL_PUBLICATION_EVIDENCE_REQUEST_STATE_INVALID",
    );
  }
  assertAuthorityFlags(
    value,
    "ADMITTED_NARRATOR_RETAIL_PUBLICATION_EVIDENCE_REQUEST_AUTHORITY_INVALID",
  );
  const { fingerprint, ...partial } = value;
  if (!HASH.test(fingerprint) || fingerprint !== stableHash(requestBase(partial))) {
    throw new AdmittedNarratorRetailPublicationOperationsError(
      "ADMITTED_NARRATOR_RETAIL_PUBLICATION_EVIDENCE_REQUEST_FINGERPRINT_INVALID",
    );
  }
}

export function submitAdmittedNarratorRetailPublicationEvidence(input: Readonly<{
  request: AdmittedNarratorRetailPublicationEvidenceRequest;
  verification: AdmittedNarratorRetailPublicationVerification;
  sourceReferenceHash: string;
  receivedByActorId: string;
  receivedAt?: Date;
}>): AdmittedNarratorRetailPublicationEvidence {
  assertAdmittedNarratorRetailPublicationEvidenceRequest(input.request);
  assertVerificationLineage(input.request.monitor, input.verification);
  const receivedAt = input.receivedAt ?? new Date();
  recordAdmittedNarratorRetailPublicationRefresh(
    input.request.monitor,
    input.verification,
    receivedAt,
  );
  const inboxItem = submitAudiobookRetailPublicationEvidence({
    request: input.request.request,
    verification: input.verification.verification,
    sourceReferenceHash: input.sourceReferenceHash,
    receivedByActorId: input.receivedByActorId,
    receivedAt,
  });
  const partial: Omit<
    AdmittedNarratorRetailPublicationEvidence,
    "fingerprint"
  > = {
    schemaVersion: ADMITTED_NARRATOR_RETAIL_PUBLICATION_EVIDENCE_SCHEMA,
    request: input.request,
    verification: input.verification,
    inboxItem,
    narratorAdmissionComplete: true,
    admittedListingIdentityBound: true,
    narratorLineageBound: true,
    publicProductIdentityBound: true,
    evidenceAvailable: true,
    refreshEligible: true,
    automaticRefreshAuthority: false,
    automaticRemediationAuthority: false,
    automaticRepublishAuthority: false,
    publicationAuthority: false,
    receivedAt: inboxItem.receivedAt,
  };
  const value = Object.freeze({
    ...partial,
    fingerprint: stableHash(evidenceBase(partial)),
  });
  assertAdmittedNarratorRetailPublicationEvidence(value);
  return value;
}

export function assertAdmittedNarratorRetailPublicationEvidence(
  value: AdmittedNarratorRetailPublicationEvidence,
): void {
  if (
    value.schemaVersion !== ADMITTED_NARRATOR_RETAIL_PUBLICATION_EVIDENCE_SCHEMA
  ) {
    throw new AdmittedNarratorRetailPublicationOperationsError(
      "ADMITTED_NARRATOR_RETAIL_PUBLICATION_EVIDENCE_SCHEMA_UNSUPPORTED",
    );
  }
  assertAdmittedNarratorRetailPublicationEvidenceRequest(value.request);
  assertAdmittedNarratorRetailPublicationVerification(value.verification);
  assertAudiobookRetailPublicationEvidenceInboxItem(value.inboxItem);
  assertVerificationLineage(value.request.monitor, value.verification);
  recordAdmittedNarratorRetailPublicationRefresh(
    value.request.monitor,
    value.verification,
    new Date(value.inboxItem.receivedAt),
  );
  if (
    value.inboxItem.request.fingerprint !== value.request.request.fingerprint
    || value.inboxItem.verification.fingerprint
      !== value.verification.verification.fingerprint
    || value.inboxItem.projectId !== value.request.monitor.projectId
    || value.inboxItem.bookId !== value.request.monitor.bookId
    || value.inboxItem.status !== "available"
    || value.receivedAt !== value.inboxItem.receivedAt
    || value.evidenceAvailable !== true
    || value.refreshEligible !== true
  ) {
    throw new AdmittedNarratorRetailPublicationOperationsError(
      "ADMITTED_NARRATOR_RETAIL_PUBLICATION_EVIDENCE_LINEAGE_INVALID",
    );
  }
  requireDate(
    value.receivedAt,
    "ADMITTED_NARRATOR_RETAIL_PUBLICATION_EVIDENCE_DATE_INVALID",
  );
  assertAuthorityFlags(
    value,
    "ADMITTED_NARRATOR_RETAIL_PUBLICATION_EVIDENCE_AUTHORITY_INVALID",
  );
  const { fingerprint, ...partial } = value;
  if (!HASH.test(fingerprint) || fingerprint !== stableHash(evidenceBase(partial))) {
    throw new AdmittedNarratorRetailPublicationOperationsError(
      "ADMITTED_NARRATOR_RETAIL_PUBLICATION_EVIDENCE_FINGERPRINT_INVALID",
    );
  }
}

export function createAdmittedNarratorRetailPublicationIncident(input: Readonly<{
  monitor: AdmittedNarratorRetailPublicationMonitor;
  recipientReferenceHash: string;
  createdAt?: Date;
}>): AdmittedNarratorRetailPublicationIncident {
  assertAdmittedNarratorRetailPublicationMonitor(input.monitor);
  if (!isActionableMonitor(input.monitor)) {
    throw new AdmittedNarratorRetailPublicationOperationsError(
      "ADMITTED_NARRATOR_RETAIL_PUBLICATION_INCIDENT_TRIGGER_NOT_ACTIONABLE",
    );
  }
  const alert = createAudiobookRetailPublicationAlert({
    monitor: input.monitor.monitor,
    recipientReferenceHash: input.recipientReferenceHash,
    ...(input.createdAt ? { createdAt: input.createdAt } : {}),
  });
  const partial: Omit<
    AdmittedNarratorRetailPublicationIncident,
    "fingerprint"
  > = {
    schemaVersion: ADMITTED_NARRATOR_RETAIL_PUBLICATION_INCIDENT_SCHEMA,
    triggerMonitor: input.monitor,
    alert,
    narratorAdmissionComplete: true,
    admittedListingIdentityBound: true,
    narratorLineageBound: true,
    publicProductIdentityBound: true,
    verifiedRecoveryRequired: true,
    automaticRefreshAuthority: false,
    automaticRemediationAuthority: false,
    automaticRepublishAuthority: false,
    publicationAuthority: false,
    status: alert.status,
    updatedAt: alert.updatedAt,
  };
  const value = Object.freeze({
    ...partial,
    fingerprint: stableHash(incidentBase(partial)),
  });
  assertAdmittedNarratorRetailPublicationIncident(value);
  return value;
}

export function resolveAdmittedNarratorRetailPublicationIncident(
  value: AdmittedNarratorRetailPublicationIncident,
  input: Readonly<{
    recoveryMonitor: AdmittedNarratorRetailPublicationMonitor;
    resolvedByActorId: string;
    resolvedAt?: Date;
  }>,
): AdmittedNarratorRetailPublicationIncident {
  assertAdmittedNarratorRetailPublicationIncident(value);
  assertSameNarratorMonitorLineage(
    value.triggerMonitor,
    input.recoveryMonitor,
  );
  if (value.status === "resolved") return value;
  const alert = resolveAudiobookRetailPublicationAlert(value.alert, {
    recoveryMonitor: input.recoveryMonitor.monitor,
    resolvedByActorId: input.resolvedByActorId,
    ...(input.resolvedAt ? { resolvedAt: input.resolvedAt } : {}),
  });
  const {
    fingerprint: _fingerprint,
    recoveryMonitor: _recoveryMonitor,
    ...base
  } = value;
  const partial: Omit<
    AdmittedNarratorRetailPublicationIncident,
    "fingerprint"
  > = {
    ...base,
    alert,
    recoveryMonitor: input.recoveryMonitor,
    status: alert.status,
    updatedAt: alert.updatedAt,
  };
  const next = Object.freeze({
    ...partial,
    fingerprint: stableHash(incidentBase(partial)),
  });
  assertAdmittedNarratorRetailPublicationIncident(next);
  return next;
}

export function assertAdmittedNarratorRetailPublicationIncident(
  value: AdmittedNarratorRetailPublicationIncident,
): void {
  if (
    value.schemaVersion !== ADMITTED_NARRATOR_RETAIL_PUBLICATION_INCIDENT_SCHEMA
  ) {
    throw new AdmittedNarratorRetailPublicationOperationsError(
      "ADMITTED_NARRATOR_RETAIL_PUBLICATION_INCIDENT_SCHEMA_UNSUPPORTED",
    );
  }
  assertAdmittedNarratorRetailPublicationMonitor(value.triggerMonitor);
  assertAudiobookRetailPublicationAlert(value.alert);
  assertAudiobookRetailPublicationAlertMatchesMonitor(
    value.alert,
    value.triggerMonitor.monitor,
  );
  if (!isActionableMonitor(value.triggerMonitor)) {
    throw new AdmittedNarratorRetailPublicationOperationsError(
      "ADMITTED_NARRATOR_RETAIL_PUBLICATION_INCIDENT_TRIGGER_NOT_ACTIONABLE",
    );
  }
  if (value.recoveryMonitor) {
    assertSameNarratorMonitorLineage(
      value.triggerMonitor,
      value.recoveryMonitor,
    );
    const recovery = value.recoveryMonitor;
    const transition = recovery.monitor.transitions.at(-1)!;
    const resolution = value.alert.resolution;
    if (
      value.alert.status !== "resolved"
      || !resolution
      || recovery.currentHealth !== "healthy-live"
      || transition.kind !== "recovery"
      || resolution.recoveryMonitorRevision !== recovery.monitor.revision
      || resolution.recoveryMonitorFingerprint !== recovery.monitor.fingerprint
      || resolution.recoveryTransitionSequence !== transition.sequence
      || resolution.recoveryTransitionFingerprint !== transition.fingerprint
    ) {
      throw new AdmittedNarratorRetailPublicationOperationsError(
        "ADMITTED_NARRATOR_RETAIL_PUBLICATION_INCIDENT_RECOVERY_LINEAGE_INVALID",
      );
    }
  } else if (value.alert.resolution !== undefined || value.alert.status === "resolved") {
    throw new AdmittedNarratorRetailPublicationOperationsError(
      "ADMITTED_NARRATOR_RETAIL_PUBLICATION_INCIDENT_RECOVERY_MISSING",
    );
  }
  if (
    value.verifiedRecoveryRequired !== true
    || value.status !== value.alert.status
    || value.updatedAt !== value.alert.updatedAt
  ) {
    throw new AdmittedNarratorRetailPublicationOperationsError(
      "ADMITTED_NARRATOR_RETAIL_PUBLICATION_INCIDENT_STATE_INVALID",
    );
  }
  requireDate(
    value.updatedAt,
    "ADMITTED_NARRATOR_RETAIL_PUBLICATION_INCIDENT_DATE_INVALID",
  );
  assertAuthorityFlags(
    value,
    "ADMITTED_NARRATOR_RETAIL_PUBLICATION_INCIDENT_AUTHORITY_INVALID",
  );
  const { fingerprint, ...partial } = value;
  if (!HASH.test(fingerprint) || fingerprint !== stableHash(incidentBase(partial))) {
    throw new AdmittedNarratorRetailPublicationOperationsError(
      "ADMITTED_NARRATOR_RETAIL_PUBLICATION_INCIDENT_FINGERPRINT_INVALID",
    );
  }
}

function createOperation(
  input: Omit<AdmittedNarratorRetailPublicationOperation, "fingerprint">,
): AdmittedNarratorRetailPublicationOperation {
  const value = Object.freeze({
    ...input,
    fingerprint: stableHash(operationBase(input)),
  });
  assertAdmittedNarratorRetailPublicationOperation(value);
  return value;
}

export function applyAdmittedNarratorRetailPublicationEvidence(input: Readonly<{
  evidence: AdmittedNarratorRetailPublicationEvidence;
  actorId: string;
  recipientReferenceHash: string;
  occurredAt?: Date;
}>): AdmittedNarratorRetailPublicationOperation {
  assertAdmittedNarratorRetailPublicationEvidence(input.evidence);
  const occurredAt = input.occurredAt ?? new Date();
  const actorId = requireIdentifier(
    input.actorId,
    "ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATION_ACTOR_INVALID",
  );
  requireHash(
    input.recipientReferenceHash,
    "ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATION_RECIPIENT_HASH_INVALID",
  );
  const previousMonitor = input.evidence.request.monitor;
  const monitor = recordAdmittedNarratorRetailPublicationRefresh(
    previousMonitor,
    input.evidence.verification,
    occurredAt,
  );
  const acknowledgedEvidence = acknowledgeAudiobookRetailPublicationEvidence(
    input.evidence.inboxItem,
    {
      monitor: monitor.monitor,
      acknowledgedByActorId: actorId,
      acknowledgedAt: occurredAt,
    },
  );
  const incident = isActionableMonitor(monitor)
    ? createAdmittedNarratorRetailPublicationIncident({
        monitor,
        recipientReferenceHash: input.recipientReferenceHash,
        createdAt: occurredAt,
      })
    : undefined;
  return createOperation({
    schemaVersion: ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATION_SCHEMA,
    kind: "evidence-refresh",
    previousMonitor,
    monitor,
    evidence: input.evidence,
    acknowledgedEvidence,
    ...(incident ? { incident } : {}),
    narratorAdmissionComplete: true,
    admittedListingIdentityBound: true,
    narratorLineageBound: true,
    publicProductIdentityBound: true,
    evidenceAcknowledged: true,
    incidentCreated: incident !== undefined,
    automaticRefreshAuthority: false,
    automaticRemediationAuthority: false,
    automaticRepublishAuthority: false,
    publicationAuthority: false,
    occurredAt: occurredAt.toISOString(),
  });
}

export function markAdmittedNarratorRetailPublicationEvidenceStale(
  input: Readonly<{
    monitor: AdmittedNarratorRetailPublicationMonitor;
    recipientReferenceHash: string;
    occurredAt?: Date;
  }>,
): AdmittedNarratorRetailPublicationOperation {
  assertAdmittedNarratorRetailPublicationMonitor(input.monitor);
  if (input.monitor.currentHealth === "stale") {
    throw new AdmittedNarratorRetailPublicationOperationsError(
      "ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATION_ALREADY_STALE",
    );
  }
  requireHash(
    input.recipientReferenceHash,
    "ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATION_RECIPIENT_HASH_INVALID",
  );
  const occurredAt = input.occurredAt ?? new Date();
  const monitor = markAdmittedNarratorRetailPublicationMonitorStale(
    input.monitor,
    occurredAt,
  );
  const incident = createAdmittedNarratorRetailPublicationIncident({
    monitor,
    recipientReferenceHash: input.recipientReferenceHash,
    createdAt: occurredAt,
  });
  return createOperation({
    schemaVersion: ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATION_SCHEMA,
    kind: "evidence-stale",
    previousMonitor: input.monitor,
    monitor,
    incident,
    narratorAdmissionComplete: true,
    admittedListingIdentityBound: true,
    narratorLineageBound: true,
    publicProductIdentityBound: true,
    evidenceAcknowledged: false,
    incidentCreated: true,
    automaticRefreshAuthority: false,
    automaticRemediationAuthority: false,
    automaticRepublishAuthority: false,
    publicationAuthority: false,
    occurredAt: occurredAt.toISOString(),
  });
}

export function assertAdmittedNarratorRetailPublicationOperation(
  value: AdmittedNarratorRetailPublicationOperation,
): void {
  if (
    value.schemaVersion !== ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATION_SCHEMA
  ) {
    throw new AdmittedNarratorRetailPublicationOperationsError(
      "ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATION_SCHEMA_UNSUPPORTED",
    );
  }
  assertAdmittedNarratorRetailPublicationMonitor(value.previousMonitor);
  assertAdmittedNarratorRetailPublicationMonitor(value.monitor);
  assertSameNarratorMonitorLineage(value.previousMonitor, value.monitor);
  requireDate(
    value.occurredAt,
    "ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATION_DATE_INVALID",
  );
  if (value.monitor.updatedAt !== value.occurredAt) {
    throw new AdmittedNarratorRetailPublicationOperationsError(
      "ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATION_DATE_MISMATCH",
    );
  }
  if (value.kind === "evidence-refresh") {
    if (!value.evidence || !value.acknowledgedEvidence) {
      throw new AdmittedNarratorRetailPublicationOperationsError(
        "ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATION_EVIDENCE_REQUIRED",
      );
    }
    assertAdmittedNarratorRetailPublicationEvidence(value.evidence);
    assertAudiobookRetailPublicationEvidenceInboxItem(
      value.acknowledgedEvidence,
    );
    const expected = recordAdmittedNarratorRetailPublicationRefresh(
      value.previousMonitor,
      value.evidence.verification,
      new Date(value.occurredAt),
    );
    if (
      value.evidence.request.monitor.fingerprint
        !== value.previousMonitor.fingerprint
      || expected.fingerprint !== value.monitor.fingerprint
      || value.acknowledgedEvidence.status !== "acknowledged"
      || value.acknowledgedEvidence.request.fingerprint
        !== value.evidence.inboxItem.request.fingerprint
      || value.acknowledgedEvidence.verification.fingerprint
        !== value.evidence.inboxItem.verification.fingerprint
      || value.acknowledgedEvidence.acknowledgement?.monitorFingerprint
        !== value.monitor.monitor.fingerprint
      || value.acknowledgedEvidence.acknowledgement?.verificationFingerprint
        !== value.evidence.verification.verification.fingerprint
      || value.evidenceAcknowledged !== true
    ) {
      throw new AdmittedNarratorRetailPublicationOperationsError(
        "ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATION_EVIDENCE_LINEAGE_INVALID",
      );
    }
  } else if (value.kind === "evidence-stale") {
    if (
      value.evidence !== undefined
      || value.acknowledgedEvidence !== undefined
      || value.evidenceAcknowledged !== false
    ) {
      throw new AdmittedNarratorRetailPublicationOperationsError(
        "ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATION_STALE_EVIDENCE_INVALID",
      );
    }
    const expected = markAdmittedNarratorRetailPublicationMonitorStale(
      value.previousMonitor,
      new Date(value.occurredAt),
    );
    if (expected.fingerprint !== value.monitor.fingerprint) {
      throw new AdmittedNarratorRetailPublicationOperationsError(
        "ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATION_STALE_LINEAGE_INVALID",
      );
    }
  } else {
    throw new AdmittedNarratorRetailPublicationOperationsError(
      "ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATION_KIND_INVALID",
    );
  }

  const incidentRequired = isActionableMonitor(value.monitor);
  if (
    value.incidentCreated !== incidentRequired
    || (incidentRequired && !value.incident)
    || (!incidentRequired && value.incident !== undefined)
  ) {
    throw new AdmittedNarratorRetailPublicationOperationsError(
      "ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATION_INCIDENT_STATE_INVALID",
    );
  }
  if (value.incident) {
    assertAdmittedNarratorRetailPublicationIncident(value.incident);
    if (
      value.incident.triggerMonitor.fingerprint !== value.monitor.fingerprint
    ) {
      throw new AdmittedNarratorRetailPublicationOperationsError(
        "ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATION_INCIDENT_LINEAGE_INVALID",
      );
    }
  }
  assertAuthorityFlags(
    value,
    "ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATION_AUTHORITY_INVALID",
  );
  const { fingerprint, ...partial } = value;
  if (!HASH.test(fingerprint) || fingerprint !== stableHash(operationBase(partial))) {
    throw new AdmittedNarratorRetailPublicationOperationsError(
      "ADMITTED_NARRATOR_RETAIL_PUBLICATION_OPERATION_FINGERPRINT_INVALID",
    );
  }
}

export function admittedNarratorRetailPublicationEvidenceRequestPublicView(
  value: AdmittedNarratorRetailPublicationEvidenceRequest,
): AdmittedNarratorRetailPublicationEvidenceRequestPublicView {
  assertAdmittedNarratorRetailPublicationEvidenceRequest(value);
  const monitor = admittedNarratorRetailPublicationMonitorPublicView(
    value.monitor,
    new Date(value.requestedAt),
  );
  return Object.freeze({
    bookId: value.monitor.bookId,
    distributor: "acx-audible",
    marketplace: "audible",
    audiobookAsin: value.monitor.audiobookAsin,
    displayTitle: monitor.displayTitle,
    narratorCredit: monitor.narratorCredit,
    expectedMonitorRevision: value.monitor.monitor.revision,
    currentHealth: value.monitor.currentHealth,
    requiredRegions: value.request.requiredRegions,
    nextRefreshDueAt: value.monitor.monitor.nextRefreshDueAt,
    narratorAdmissionComplete: true,
    admittedListingIdentityBound: true,
    narratorLineageBound: true,
    publicProductIdentityBound: true,
    evidenceAcquisitionRequested: true,
    automaticRefreshAuthority: false,
    automaticRemediationAuthority: false,
    automaticRepublishAuthority: false,
    publicationAuthority: false,
    requestedAt: value.requestedAt,
    fingerprint: value.fingerprint,
  });
}

export function admittedNarratorRetailPublicationEvidencePublicView(
  value: AdmittedNarratorRetailPublicationEvidence,
): AdmittedNarratorRetailPublicationEvidencePublicView {
  assertAdmittedNarratorRetailPublicationEvidence(value);
  const metadata = listingMetadata(value.request.monitor);
  return Object.freeze({
    bookId: value.request.monitor.bookId,
    distributor: "acx-audible",
    marketplace: "audible",
    audiobookAsin: value.request.monitor.audiobookAsin,
    displayTitle: metadata.displayTitle,
    narratorCredit: metadata.narratorCredit,
    expectedMonitorRevision: value.request.monitor.monitor.revision,
    verificationStatus: value.verification.status,
    verificationVerifiedAt: value.verification.verifiedAt,
    observationExpiresAt:
      value.verification.observation.observation.expiresAt,
    narratorAdmissionComplete: true,
    admittedListingIdentityBound: true,
    narratorLineageBound: true,
    publicProductIdentityBound: true,
    evidenceAvailable: true,
    refreshEligible: true,
    automaticRefreshAuthority: false,
    automaticRemediationAuthority: false,
    automaticRepublishAuthority: false,
    publicationAuthority: false,
    receivedAt: value.receivedAt,
    fingerprint: value.fingerprint,
  });
}

export function admittedNarratorRetailPublicationIncidentPublicView(
  value: AdmittedNarratorRetailPublicationIncident,
): AdmittedNarratorRetailPublicationIncidentPublicView {
  assertAdmittedNarratorRetailPublicationIncident(value);
  const alert = audiobookRetailPublicationAlertPublicView(value.alert);
  const metadata = listingMetadata(value.triggerMonitor);
  return Object.freeze({
    bookId: value.triggerMonitor.bookId,
    distributor: "acx-audible",
    marketplace: "audible",
    audiobookAsin: value.triggerMonitor.audiobookAsin,
    displayTitle: metadata.displayTitle,
    narratorCredit: metadata.narratorCredit,
    category: alert.category,
    severity: alert.severity,
    currentHealth: value.triggerMonitor.currentHealth as Exclude<
      AdmittedNarratorRetailPublicationMonitor["currentHealth"],
      "healthy-live"
    >,
    findingCodes: alert.findingCodes,
    notificationDeliveryStatus: alert.notification.deliveryStatus,
    notificationAttemptCount: alert.notification.attemptCount,
    status: alert.status,
    ...(alert.resolvedAt ? { resolvedAt: alert.resolvedAt } : {}),
    narratorAdmissionComplete: true,
    admittedListingIdentityBound: true,
    narratorLineageBound: true,
    publicProductIdentityBound: true,
    verifiedRecoveryRequired: true,
    automaticRefreshAuthority: false,
    automaticRemediationAuthority: false,
    automaticRepublishAuthority: false,
    publicationAuthority: false,
    updatedAt: value.updatedAt,
    fingerprint: value.fingerprint,
  });
}

export function admittedNarratorRetailPublicationOperationPublicView(
  value: AdmittedNarratorRetailPublicationOperation,
): AdmittedNarratorRetailPublicationOperationPublicView {
  assertAdmittedNarratorRetailPublicationOperation(value);
  const metadata = listingMetadata(value.monitor);
  const transition = value.monitor.monitor.transitions.at(-1)!;
  return Object.freeze({
    bookId: value.monitor.bookId,
    distributor: "acx-audible",
    marketplace: "audible",
    audiobookAsin: value.monitor.audiobookAsin,
    displayTitle: metadata.displayTitle,
    narratorCredit: metadata.narratorCredit,
    kind: value.kind,
    currentHealth: value.monitor.currentHealth,
    transitionKind: transition.kind,
    latestVerificationStatus: value.monitor.latestVerificationStatus,
    evidenceAcknowledged: value.evidenceAcknowledged,
    incidentCreated: value.incidentCreated,
    ...(value.incident
      ? {
          incidentCategory: value.incident.alert.category,
          incidentSeverity: value.incident.alert.severity,
        }
      : {}),
    narratorAdmissionComplete: true,
    admittedListingIdentityBound: true,
    narratorLineageBound: true,
    publicProductIdentityBound: true,
    automaticRefreshAuthority: false,
    automaticRemediationAuthority: false,
    automaticRepublishAuthority: false,
    publicationAuthority: false,
    occurredAt: value.occurredAt,
    fingerprint: value.fingerprint,
  });
}
