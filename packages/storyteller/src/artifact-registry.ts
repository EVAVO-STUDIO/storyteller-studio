import {
  stableHash,
  type Finding,
  type GenerationJob,
  type ProjectUse,
} from "./index.js";
import { validateGenerationJob } from "./generation-queue-contracts.js";

export const ARTIFACT_REGISTRY_SCHEMA_VERSION = "storyteller-artifact-v1" as const;

export type ArtifactKind =
  | "audio-candidate"
  | "transcript"
  | "word-alignment"
  | "waveform"
  | "audio-analysis"
  | "illustration-layer"
  | "visual-render"
  | "chapter-master"
  | "mastered-chapter"
  | "credit-master"
  | "audiobook-reference-master"
  | "audiobook-retail-track"
  | "audiobook-retail-sample"
  | "release-package";

export type ArtifactVerificationStatus =
  | "pending"
  | "verified"
  | "quarantined"
  | "rejected";

export type ArtifactReviewStatus =
  | "not-required"
  | "pending"
  | "approved"
  | "changes-requested";

export type ArtifactReleaseStatus = "unavailable" | "released";

export interface ArtifactStorageReference {
  driver: "private-object-store" | "local-private-file";
  provider: string;
  container: string;
  objectKey: string;
  versionId?: string;
  region?: string;
}

export interface ArtifactIntegrity {
  algorithm: "sha256";
  contentHash: string;
  byteCount: number;
  mimeType: string;
  format: string;
}

export interface ArtifactProvenance {
  createdByActorId: string;
  sourceContentHash?: string;
  generationRequestHash?: string;
  providerId?: string;
  adapterVersion?: string;
  providerRequestId?: string;
  parentArtifactIds: readonly string[];
}

export interface ArtifactRightsSnapshot {
  rightsEvidenceId: string;
  rightsFingerprint: string;
  allowedUses: readonly ProjectUse[];
  commercialUseApproved: boolean;
  expiresAt?: string;
  retainUntil?: string;
  deletionRequiredAt?: string;
}

export interface ArtifactVerification {
  status: ArtifactVerificationStatus;
  checks: readonly string[];
  findings: readonly Finding[];
  checkedByActorId?: string;
  checkedAt?: string;
  observedContentHash?: string;
  observedByteCount?: number;
}

export interface ArtifactReview {
  required: boolean;
  status: ArtifactReviewStatus;
  reviewerId?: string;
  decidedAt?: string;
  notes?: string;
}

export interface ArtifactQuarantine {
  code: string;
  message: string;
  quarantinedByActorId: string;
  quarantinedAt: string;
}

export interface ArtifactRelease {
  status: ArtifactReleaseStatus;
  finalConfirmationId?: string;
  releasedByActorId?: string;
  releasedAt?: string;
}

export interface ArtifactRecord {
  schemaVersion: typeof ARTIFACT_REGISTRY_SCHEMA_VERSION;
  id: string;
  kind: ArtifactKind;
  projectId: string;
  jobId?: string;
  segmentId?: string;
  takeId?: string;
  storage: ArtifactStorageReference;
  integrity: ArtifactIntegrity;
  provenance: ArtifactProvenance;
  rights: ArtifactRightsSnapshot;
  verification: ArtifactVerification;
  review: ArtifactReview;
  release: ArtifactRelease;
  quarantine?: ArtifactQuarantine;
  revision: number;
  createdAt: string;
  updatedAt: string;
  previousFingerprint?: string;
  fingerprint: string;
}

export interface CreateArtifactRecordInput {
  id: string;
  kind: ArtifactKind;
  projectId: string;
  jobId?: string;
  segmentId?: string;
  takeId?: string;
  storage: ArtifactStorageReference;
  integrity: ArtifactIntegrity;
  provenance: ArtifactProvenance;
  rights: ArtifactRightsSnapshot;
  reviewRequired?: boolean;
}

export interface ArtifactGateAssessment {
  ok: boolean;
  artifactIds: readonly string[];
  findings: readonly Finding[];
}

export interface ArtifactPublicView {
  id: string;
  kind: ArtifactKind;
  projectId: string;
  jobId?: string;
  segmentId?: string;
  takeId?: string;
  storage: Readonly<{
    driver: ArtifactStorageReference["driver"];
    provider: string;
    region?: string;
  }>;
  integrity: ArtifactIntegrity;
  provider?: Readonly<{
    providerId: string;
    adapterVersion?: string;
  }>;
  parentArtifactIds: readonly string[];
  verification: ArtifactVerification;
  review: ArtifactReview;
  release: ArtifactRelease;
  revision: number;
  createdAt: string;
  updatedAt: string;
  fingerprint: string;
}

const ARTIFACT_KINDS: ReadonlySet<ArtifactKind> = new Set([
  "audio-candidate",
  "transcript",
  "word-alignment",
  "waveform",
  "audio-analysis",
  "illustration-layer",
  "visual-render",
  "chapter-master",
  "mastered-chapter",
  "credit-master",
  "audiobook-reference-master",
  "audiobook-retail-track",
  "audiobook-retail-sample",
  "release-package",
]);

const VERIFICATION_STATUSES: ReadonlySet<ArtifactVerificationStatus> = new Set([
  "pending",
  "verified",
  "quarantined",
  "rejected",
]);

const REVIEW_STATUSES: ReadonlySet<ArtifactReviewStatus> = new Set([
  "not-required",
  "pending",
  "approved",
  "changes-requested",
]);

const REVIEW_REQUIRED_KINDS: ReadonlySet<ArtifactKind> = new Set([
  "audio-candidate",
  "illustration-layer",
  "visual-render",
  "chapter-master",
  "mastered-chapter",
  "credit-master",
  "audiobook-reference-master",
  "audiobook-retail-track",
  "audiobook-retail-sample",
  "release-package",
]);

const PROVIDER_GENERATED_KINDS: ReadonlySet<ArtifactKind> = new Set([
  "audio-candidate",
  "illustration-layer",
  "visual-render",
]);

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;
const SAFE_CODE = /^[A-Z][A-Z0-9_]{2,95}$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const MIME_PATTERN = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/u;
const FORMAT_PATTERN = /^[a-z0-9][a-z0-9._+-]{0,31}$/u;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/u;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/u;
const URL_SCHEME_PATTERN = /^[A-Za-z][A-Za-z0-9+.-]*:\/\//u;
const MAX_TEXT_LENGTH = 500;
const MAX_STORAGE_COMPONENT_LENGTH = 240;
const MAX_OBJECT_KEY_LENGTH = 1_024;
const MAX_PARENTS = 128;
const MAX_CHECKS = 64;
const MAX_FINDINGS = 128;

function requireIdentifier(value: string, code: string): string {
  if (!SAFE_IDENTIFIER.test(value)) throw new Error(code);
  return value;
}

function requireHash(value: string, code: string): string {
  if (!HASH_PATTERN.test(value)) throw new Error(code);
  return value;
}

function requireDate(value: string, code: string): string {
  if (!value || Number.isNaN(new Date(value).getTime())) throw new Error(code);
  return value;
}

function requireBoundedText(value: string, maximum: number, code: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maximum || CONTROL_CHARACTER_PATTERN.test(trimmed)) {
    throw new Error(code);
  }
  return trimmed;
}

function uniqueBoundedStrings(
  values: readonly string[],
  maximumItems: number,
  maximumLength: number,
  code: string,
): readonly string[] {
  if (!Array.isArray(values) || values.length > maximumItems) throw new Error(code);
  const unique = new Set<string>();
  for (const value of values) {
    const checked = requireBoundedText(value, maximumLength, code);
    if (unique.has(checked)) throw new Error(`${code}_DUPLICATE`);
    unique.add(checked);
  }
  return Object.freeze([...unique]);
}

function validateStorage(reference: ArtifactStorageReference): void {
  requireBoundedText(reference.provider, MAX_STORAGE_COMPONENT_LENGTH, "ARTIFACT_STORAGE_PROVIDER_INVALID");
  requireBoundedText(reference.container, MAX_STORAGE_COMPONENT_LENGTH, "ARTIFACT_STORAGE_CONTAINER_INVALID");
  const objectKey = requireBoundedText(reference.objectKey, MAX_OBJECT_KEY_LENGTH, "ARTIFACT_STORAGE_OBJECT_KEY_INVALID");
  if (
    URL_SCHEME_PATTERN.test(objectKey)
    || objectKey.startsWith("/")
    || objectKey.startsWith("\\")
    || objectKey.includes("?")
    || objectKey.includes("#")
    || objectKey.includes("\\")
    || objectKey.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new Error("ARTIFACT_STORAGE_OBJECT_KEY_UNSAFE");
  }
  if (reference.versionId !== undefined) {
    requireBoundedText(reference.versionId, MAX_STORAGE_COMPONENT_LENGTH, "ARTIFACT_STORAGE_VERSION_INVALID");
  }
  if (reference.region !== undefined) {
    requireBoundedText(reference.region, 80, "ARTIFACT_STORAGE_REGION_INVALID");
  }
}

function validateIntegrity(kind: ArtifactKind, integrity: ArtifactIntegrity): void {
  if (integrity.algorithm !== "sha256") throw new Error("ARTIFACT_INTEGRITY_ALGORITHM_UNSUPPORTED");
  requireHash(integrity.contentHash, "ARTIFACT_CONTENT_HASH_INVALID");
  if (!Number.isSafeInteger(integrity.byteCount) || integrity.byteCount < 1) {
    throw new Error("ARTIFACT_BYTE_COUNT_INVALID");
  }
  if (!MIME_PATTERN.test(integrity.mimeType)) throw new Error("ARTIFACT_MIME_TYPE_INVALID");
  if (!FORMAT_PATTERN.test(integrity.format)) throw new Error("ARTIFACT_FORMAT_INVALID");

  const mime = integrity.mimeType;
  if ((kind === "audio-candidate" || kind === "chapter-master" || kind === "mastered-chapter" || kind === "credit-master" || kind === "audiobook-reference-master" || kind === "audiobook-retail-track" || kind === "audiobook-retail-sample") && !mime.startsWith("audio/")) {
    throw new Error("ARTIFACT_AUDIO_MIME_REQUIRED");
  }
  if (
    kind === "audiobook-retail-track"
    && (mime !== "audio/mpeg" || integrity.format !== "mp3")
  ) {
    throw new Error("ARTIFACT_RETAIL_TRACK_MP3_REQUIRED");
  }
  if (
    kind === "audiobook-retail-sample"
    && (mime !== "audio/mpeg" || integrity.format !== "mp3")
  ) {
    throw new Error("ARTIFACT_RETAIL_SAMPLE_MP3_REQUIRED");
  }
  if ((kind === "word-alignment" || kind === "audio-analysis") && mime !== "application/json") {
    throw new Error("ARTIFACT_JSON_MIME_REQUIRED");
  }
  if (kind === "transcript" && !(mime.startsWith("text/") || mime === "application/json")) {
    throw new Error("ARTIFACT_TRANSCRIPT_MIME_INVALID");
  }
  if (kind === "waveform" && !(mime.startsWith("image/") || mime === "application/json")) {
    throw new Error("ARTIFACT_WAVEFORM_MIME_INVALID");
  }
  if ((kind === "illustration-layer" || kind === "visual-render") && !(mime.startsWith("image/") || mime.startsWith("video/"))) {
    throw new Error("ARTIFACT_VISUAL_MIME_INVALID");
  }
  if (kind === "release-package" && !mime.startsWith("application/")) {
    throw new Error("ARTIFACT_RELEASE_PACKAGE_MIME_INVALID");
  }
}

function validateProvenance(record: Pick<ArtifactRecord, "id" | "kind" | "jobId" | "segmentId" | "takeId" | "provenance">): void {
  requireIdentifier(record.provenance.createdByActorId, "ARTIFACT_CREATOR_ID_INVALID");
  const parents = uniqueBoundedStrings(
    record.provenance.parentArtifactIds,
    MAX_PARENTS,
    128,
    "ARTIFACT_PARENT_IDS_INVALID",
  );
  for (const parentId of parents) {
    requireIdentifier(parentId, "ARTIFACT_PARENT_ID_INVALID");
    if (parentId === record.id) throw new Error("ARTIFACT_PARENT_SELF_REFERENCE");
  }
  if (record.provenance.sourceContentHash !== undefined) {
    requireHash(record.provenance.sourceContentHash, "ARTIFACT_SOURCE_HASH_INVALID");
  }
  if (record.provenance.generationRequestHash !== undefined) {
    requireHash(record.provenance.generationRequestHash, "ARTIFACT_GENERATION_REQUEST_HASH_INVALID");
  }
  if (record.provenance.providerId !== undefined) {
    requireIdentifier(record.provenance.providerId, "ARTIFACT_PROVIDER_ID_INVALID");
  }
  if (record.provenance.adapterVersion !== undefined && !SEMVER_PATTERN.test(record.provenance.adapterVersion)) {
    throw new Error("ARTIFACT_ADAPTER_VERSION_INVALID");
  }
  if (record.provenance.providerRequestId !== undefined) {
    requireBoundedText(record.provenance.providerRequestId, 240, "ARTIFACT_PROVIDER_REQUEST_ID_INVALID");
  }

  if (PROVIDER_GENERATED_KINDS.has(record.kind)) {
    if (!record.jobId || !record.segmentId || !record.takeId) {
      throw new Error("ARTIFACT_PROVIDER_SCOPE_REQUIRED");
    }
    if (
      !record.provenance.providerId
      || !record.provenance.adapterVersion
      || !record.provenance.generationRequestHash
    ) {
      throw new Error("ARTIFACT_PROVIDER_PROVENANCE_REQUIRED");
    }
  }
  if ((record.kind === "chapter-master" || record.kind === "mastered-chapter" || record.kind === "credit-master" || record.kind === "audiobook-reference-master" || record.kind === "audiobook-retail-track" || record.kind === "audiobook-retail-sample" || record.kind === "release-package") && parents.length === 0) {
    throw new Error("ARTIFACT_PARENT_REQUIRED");
  }
}

function validateRights(rights: ArtifactRightsSnapshot): void {
  requireIdentifier(rights.rightsEvidenceId, "ARTIFACT_RIGHTS_EVIDENCE_ID_INVALID");
  requireHash(rights.rightsFingerprint, "ARTIFACT_RIGHTS_FINGERPRINT_INVALID");
  if (!Array.isArray(rights.allowedUses) || rights.allowedUses.length === 0) {
    throw new Error("ARTIFACT_RIGHTS_ALLOWED_USES_REQUIRED");
  }
  if (new Set(rights.allowedUses).size !== rights.allowedUses.length) {
    throw new Error("ARTIFACT_RIGHTS_ALLOWED_USES_DUPLICATE");
  }
  for (const value of [rights.expiresAt, rights.retainUntil, rights.deletionRequiredAt]) {
    if (value !== undefined) requireDate(value, "ARTIFACT_RIGHTS_DATE_INVALID");
  }
  if (
    rights.retainUntil
    && rights.deletionRequiredAt
    && Date.parse(rights.deletionRequiredAt) < Date.parse(rights.retainUntil)
  ) {
    throw new Error("ARTIFACT_RETENTION_DATE_ORDER_INVALID");
  }
}

function validateFinding(finding: Finding): void {
  if (!SAFE_CODE.test(finding.code)) throw new Error("ARTIFACT_FINDING_CODE_INVALID");
  requireBoundedText(finding.message, MAX_TEXT_LENGTH, "ARTIFACT_FINDING_MESSAGE_INVALID");
}

function validateVerification(record: ArtifactRecord): void {
  const verification = record.verification;
  if (!VERIFICATION_STATUSES.has(verification.status)) throw new Error("ARTIFACT_VERIFICATION_STATUS_INVALID");
  uniqueBoundedStrings(verification.checks, MAX_CHECKS, 120, "ARTIFACT_VERIFICATION_CHECKS_INVALID");
  if (!Array.isArray(verification.findings) || verification.findings.length > MAX_FINDINGS) {
    throw new Error("ARTIFACT_VERIFICATION_FINDINGS_INVALID");
  }
  for (const finding of verification.findings) validateFinding(finding);

  if (verification.status === "pending") {
    if (
      verification.checkedByActorId
      || verification.checkedAt
      || verification.observedContentHash
      || verification.observedByteCount !== undefined
      || record.quarantine
    ) {
      throw new Error("ARTIFACT_PENDING_VERIFICATION_STATE_INVALID");
    }
    return;
  }

  if (!verification.checkedByActorId || !verification.checkedAt) {
    throw new Error("ARTIFACT_VERIFICATION_EVIDENCE_REQUIRED");
  }
  requireIdentifier(verification.checkedByActorId, "ARTIFACT_VERIFIER_ID_INVALID");
  requireDate(verification.checkedAt, "ARTIFACT_VERIFICATION_DATE_INVALID");
  if (verification.observedContentHash !== undefined) {
    requireHash(verification.observedContentHash, "ARTIFACT_OBSERVED_HASH_INVALID");
  }
  if (
    verification.observedByteCount !== undefined
    && (!Number.isSafeInteger(verification.observedByteCount) || verification.observedByteCount < 0)
  ) {
    throw new Error("ARTIFACT_OBSERVED_BYTE_COUNT_INVALID");
  }

  if (verification.status === "verified") {
    if (
      verification.observedContentHash !== record.integrity.contentHash
      || verification.observedByteCount !== record.integrity.byteCount
      || verification.findings.some((finding) => finding.severity === "error")
      || record.quarantine
    ) {
      throw new Error("ARTIFACT_VERIFIED_STATE_INVALID");
    }
  } else {
    if (!record.quarantine) throw new Error("ARTIFACT_QUARANTINE_REQUIRED");
    if (!SAFE_CODE.test(record.quarantine.code)) throw new Error("ARTIFACT_QUARANTINE_CODE_INVALID");
    requireBoundedText(record.quarantine.message, MAX_TEXT_LENGTH, "ARTIFACT_QUARANTINE_MESSAGE_INVALID");
    requireIdentifier(record.quarantine.quarantinedByActorId, "ARTIFACT_QUARANTINE_ACTOR_INVALID");
    requireDate(record.quarantine.quarantinedAt, "ARTIFACT_QUARANTINE_DATE_INVALID");
  }
}

function validateReview(record: ArtifactRecord): void {
  const review = record.review;
  if (!REVIEW_STATUSES.has(review.status)) throw new Error("ARTIFACT_REVIEW_STATUS_INVALID");
  if (!review.required && review.status !== "not-required") {
    throw new Error("ARTIFACT_REVIEW_NOT_REQUIRED_STATE_INVALID");
  }
  if (review.required && review.status === "not-required") {
    throw new Error("ARTIFACT_REVIEW_REQUIRED_STATE_INVALID");
  }
  if (review.status === "approved" || review.status === "changes-requested") {
    if (!review.reviewerId || !review.decidedAt) throw new Error("ARTIFACT_REVIEW_DECISION_EVIDENCE_REQUIRED");
    requireIdentifier(review.reviewerId, "ARTIFACT_REVIEWER_ID_INVALID");
    requireDate(review.decidedAt, "ARTIFACT_REVIEW_DATE_INVALID");
    if (record.verification.status !== "verified") throw new Error("ARTIFACT_REVIEW_BEFORE_VERIFICATION");
    if (review.status === "changes-requested" && !review.notes) {
      throw new Error("ARTIFACT_REVIEW_NOTES_REQUIRED");
    }
  } else if (review.reviewerId || review.decidedAt || review.notes) {
    throw new Error("ARTIFACT_REVIEW_PENDING_EVIDENCE_INVALID");
  }
  if (review.notes !== undefined) {
    requireBoundedText(review.notes, MAX_TEXT_LENGTH, "ARTIFACT_REVIEW_NOTES_INVALID");
  }
}

function artifactFingerprint(value: Omit<ArtifactRecord, "fingerprint">): string {
  return stableHash(value);
}

export function assertArtifactRecord(record: ArtifactRecord): void {
  if (record.schemaVersion !== ARTIFACT_REGISTRY_SCHEMA_VERSION) throw new Error("ARTIFACT_SCHEMA_UNSUPPORTED");
  if (!ARTIFACT_KINDS.has(record.kind)) throw new Error("ARTIFACT_KIND_INVALID");
  requireIdentifier(record.id, "ARTIFACT_ID_INVALID");
  requireIdentifier(record.projectId, "ARTIFACT_PROJECT_ID_INVALID");
  if (record.jobId !== undefined) requireIdentifier(record.jobId, "ARTIFACT_JOB_ID_INVALID");
  if (record.segmentId !== undefined) requireIdentifier(record.segmentId, "ARTIFACT_SEGMENT_ID_INVALID");
  if (record.takeId !== undefined) requireIdentifier(record.takeId, "ARTIFACT_TAKE_ID_INVALID");
  if (!Number.isSafeInteger(record.revision) || record.revision < 1) throw new Error("ARTIFACT_REVISION_INVALID");
  requireDate(record.createdAt, "ARTIFACT_CREATED_AT_INVALID");
  requireDate(record.updatedAt, "ARTIFACT_UPDATED_AT_INVALID");
  if (Date.parse(record.updatedAt) < Date.parse(record.createdAt)) throw new Error("ARTIFACT_TIMESTAMP_ORDER_INVALID");
  if (record.previousFingerprint !== undefined) {
    requireHash(record.previousFingerprint, "ARTIFACT_PREVIOUS_FINGERPRINT_INVALID");
  }
  validateStorage(record.storage);
  validateIntegrity(record.kind, record.integrity);
  validateProvenance(record);
  validateRights(record.rights);
  validateVerification(record);
  validateReview(record);

  if (record.release.status === "released") {
    if (record.kind !== "release-package") throw new Error("ARTIFACT_RELEASE_KIND_INVALID");
    if (!record.release.finalConfirmationId || !record.release.releasedByActorId || !record.release.releasedAt) {
      throw new Error("ARTIFACT_RELEASE_EVIDENCE_REQUIRED");
    }
    requireIdentifier(record.release.finalConfirmationId, "ARTIFACT_FINAL_CONFIRMATION_ID_INVALID");
    requireIdentifier(record.release.releasedByActorId, "ARTIFACT_RELEASE_ACTOR_INVALID");
    requireDate(record.release.releasedAt, "ARTIFACT_RELEASE_DATE_INVALID");
    if (record.verification.status !== "verified" || record.review.status !== "approved") {
      throw new Error("ARTIFACT_RELEASE_STATE_INVALID");
    }
  } else if (
    record.release.finalConfirmationId
    || record.release.releasedByActorId
    || record.release.releasedAt
  ) {
    throw new Error("ARTIFACT_UNRELEASED_EVIDENCE_INVALID");
  }

  const { fingerprint, ...partial } = record;
  if (artifactFingerprint(partial) !== fingerprint) throw new Error("ARTIFACT_FINGERPRINT_MISMATCH");
}

export function createArtifactRecord(
  input: CreateArtifactRecordInput,
  now = new Date(),
): ArtifactRecord {
  const instant = now.toISOString();
  const reviewRequired = input.reviewRequired ?? REVIEW_REQUIRED_KINDS.has(input.kind);
  const partial: Omit<ArtifactRecord, "fingerprint"> = {
    schemaVersion: ARTIFACT_REGISTRY_SCHEMA_VERSION,
    id: input.id,
    kind: input.kind,
    projectId: input.projectId,
    ...(input.jobId ? { jobId: input.jobId } : {}),
    ...(input.segmentId ? { segmentId: input.segmentId } : {}),
    ...(input.takeId ? { takeId: input.takeId } : {}),
    storage: input.storage,
    integrity: input.integrity,
    provenance: {
      ...input.provenance,
      parentArtifactIds: Object.freeze([...input.provenance.parentArtifactIds]),
    },
    rights: {
      ...input.rights,
      allowedUses: Object.freeze([...input.rights.allowedUses]),
    },
    verification: {
      status: "pending",
      checks: Object.freeze([]),
      findings: Object.freeze([]),
    },
    review: {
      required: reviewRequired,
      status: reviewRequired ? "pending" : "not-required",
    },
    release: { status: "unavailable" },
    revision: 1,
    createdAt: instant,
    updatedAt: instant,
  };
  const record = { ...partial, fingerprint: artifactFingerprint(partial) };
  assertArtifactRecord(record);
  return record;
}

function reviseArtifact(
  record: ArtifactRecord,
  updates: Partial<Omit<ArtifactRecord, "schemaVersion" | "id" | "kind" | "projectId" | "jobId" | "segmentId" | "takeId" | "storage" | "integrity" | "provenance" | "rights" | "revision" | "createdAt" | "updatedAt" | "previousFingerprint" | "fingerprint">>,
  now: Date,
): ArtifactRecord {
  assertArtifactRecord(record);
  if (now.getTime() < Date.parse(record.updatedAt)) throw new Error("ARTIFACT_TRANSITION_TIME_REVERSED");
  const { fingerprint: _fingerprint, previousFingerprint: _previous, ...base } = record;
  const partial: Omit<ArtifactRecord, "fingerprint"> = {
    ...base,
    ...updates,
    revision: record.revision + 1,
    createdAt: record.createdAt,
    updatedAt: now.toISOString(),
    previousFingerprint: record.fingerprint,
  };
  const next = { ...partial, fingerprint: artifactFingerprint(partial) };
  assertArtifactRecord(next);
  return next;
}

export function verifyArtifactIntegrity(
  record: ArtifactRecord,
  input: Readonly<{
    observedContentHash: string;
    observedByteCount: number;
    checkedByActorId: string;
    checks: readonly string[];
    findings?: readonly Finding[];
    checkedAt?: Date;
  }>,
): ArtifactRecord {
  if (record.verification.status !== "pending") throw new Error("ARTIFACT_VERIFICATION_ALREADY_DECIDED");
  const checkedAt = input.checkedAt ?? new Date();
  requireHash(input.observedContentHash, "ARTIFACT_OBSERVED_HASH_INVALID");
  if (!Number.isSafeInteger(input.observedByteCount) || input.observedByteCount < 0) {
    throw new Error("ARTIFACT_OBSERVED_BYTE_COUNT_INVALID");
  }
  requireIdentifier(input.checkedByActorId, "ARTIFACT_VERIFIER_ID_INVALID");
  const checks = uniqueBoundedStrings(input.checks, MAX_CHECKS, 120, "ARTIFACT_VERIFICATION_CHECKS_INVALID");
  const findings: Finding[] = [...(input.findings ?? [])];
  if (input.observedContentHash !== record.integrity.contentHash) {
    findings.push({
      code: "ARTIFACT_CONTENT_HASH_MISMATCH",
      severity: "error",
      message: "Observed artifact bytes do not match the registered SHA-256 content hash.",
    });
  }
  if (input.observedByteCount !== record.integrity.byteCount) {
    findings.push({
      code: "ARTIFACT_BYTE_COUNT_MISMATCH",
      severity: "error",
      message: "Observed artifact byte count does not match the registered immutable size.",
    });
  }
  for (const finding of findings) validateFinding(finding);
  const failed = findings.some((finding) => finding.severity === "error");
  return reviseArtifact(record, {
    verification: {
      status: failed ? "quarantined" : "verified",
      checks,
      findings: Object.freeze(findings),
      checkedByActorId: input.checkedByActorId,
      checkedAt: checkedAt.toISOString(),
      observedContentHash: input.observedContentHash,
      observedByteCount: input.observedByteCount,
    },
    ...(failed
      ? {
          quarantine: {
            code: "ARTIFACT_INTEGRITY_VERIFICATION_FAILED",
            message: "Artifact failed one or more integrity or safety verification gates.",
            quarantinedByActorId: input.checkedByActorId,
            quarantinedAt: checkedAt.toISOString(),
          },
        }
      : {}),
  }, checkedAt);
}

export function quarantineArtifact(
  record: ArtifactRecord,
  input: Readonly<{
    code: string;
    message: string;
    actorId: string;
    findings?: readonly Finding[];
    quarantinedAt?: Date;
  }>,
): ArtifactRecord {
  if (record.release.status === "released") throw new Error("ARTIFACT_RELEASED_IMMUTABLE");
  if (record.verification.status === "rejected") throw new Error("ARTIFACT_REJECTED_IMMUTABLE");
  if (!SAFE_CODE.test(input.code)) throw new Error("ARTIFACT_QUARANTINE_CODE_INVALID");
  requireBoundedText(input.message, MAX_TEXT_LENGTH, "ARTIFACT_QUARANTINE_MESSAGE_INVALID");
  requireIdentifier(input.actorId, "ARTIFACT_QUARANTINE_ACTOR_INVALID");
  const at = input.quarantinedAt ?? new Date();
  const findings = [...record.verification.findings, ...(input.findings ?? [])];
  for (const finding of findings) validateFinding(finding);
  return reviseArtifact(record, {
    verification: {
      status: "quarantined",
      checks: record.verification.checks,
      findings: Object.freeze(findings),
      checkedByActorId: input.actorId,
      checkedAt: at.toISOString(),
      ...(record.verification.observedContentHash
        ? { observedContentHash: record.verification.observedContentHash }
        : {}),
      ...(record.verification.observedByteCount !== undefined
        ? { observedByteCount: record.verification.observedByteCount }
        : {}),
    },
    quarantine: {
      code: input.code,
      message: input.message,
      quarantinedByActorId: input.actorId,
      quarantinedAt: at.toISOString(),
    },
    review: {
      required: record.review.required,
      status: record.review.required ? "pending" : "not-required",
    },
    release: { status: "unavailable" },
  }, at);
}

export function rejectArtifact(
  record: ArtifactRecord,
  input: Readonly<{ actorId: string; reason: string; rejectedAt?: Date }>,
): ArtifactRecord {
  if (record.verification.status !== "quarantined") throw new Error("ARTIFACT_REJECTION_REQUIRES_QUARANTINE");
  requireIdentifier(input.actorId, "ARTIFACT_REJECTION_ACTOR_INVALID");
  requireBoundedText(input.reason, MAX_TEXT_LENGTH, "ARTIFACT_REJECTION_REASON_INVALID");
  const at = input.rejectedAt ?? new Date();
  return reviseArtifact(record, {
    verification: {
      ...record.verification,
      status: "rejected",
      checkedByActorId: input.actorId,
      checkedAt: at.toISOString(),
      findings: Object.freeze([
        ...record.verification.findings,
        {
          code: "ARTIFACT_REJECTED",
          severity: "error" as const,
          message: input.reason,
        },
      ]),
    },
    quarantine: {
      code: "ARTIFACT_REJECTED",
      message: input.reason,
      quarantinedByActorId: input.actorId,
      quarantinedAt: at.toISOString(),
    },
  }, at);
}

export function recordArtifactReview(
  record: ArtifactRecord,
  input: Readonly<{
    decision: "approved" | "changes-requested";
    reviewerId: string;
    notes?: string;
    decidedAt?: Date;
  }>,
): ArtifactRecord {
  if (!record.review.required) throw new Error("ARTIFACT_REVIEW_NOT_REQUIRED");
  if (record.verification.status !== "verified") throw new Error("ARTIFACT_REVIEW_REQUIRES_VERIFIED_ARTIFACT");
  if (record.release.status === "released") throw new Error("ARTIFACT_RELEASED_IMMUTABLE");
  requireIdentifier(input.reviewerId, "ARTIFACT_REVIEWER_ID_INVALID");
  if (input.decision === "changes-requested" && !input.notes) {
    throw new Error("ARTIFACT_REVIEW_NOTES_REQUIRED");
  }
  if (input.notes !== undefined) {
    requireBoundedText(input.notes, MAX_TEXT_LENGTH, "ARTIFACT_REVIEW_NOTES_INVALID");
  }
  const at = input.decidedAt ?? new Date();
  return reviseArtifact(record, {
    review: {
      required: true,
      status: input.decision,
      reviewerId: input.reviewerId,
      decidedAt: at.toISOString(),
      ...(input.notes ? { notes: input.notes } : {}),
    },
    release: { status: "unavailable" },
  }, at);
}

function rightsFindings(
  record: ArtifactRecord,
  input: Readonly<{ intendedUse: ProjectUse; commercial: boolean; now: Date }>,
): Finding[] {
  const findings: Finding[] = [];
  if (!record.rights.allowedUses.includes(input.intendedUse)) {
    findings.push({
      code: "ARTIFACT_USE_NOT_AUTHORISED",
      severity: "error",
      message: `Artifact rights do not cover intended use: ${input.intendedUse}.`,
    });
  }
  if (input.commercial && !record.rights.commercialUseApproved) {
    findings.push({
      code: "ARTIFACT_COMMERCIAL_USE_NOT_APPROVED",
      severity: "error",
      message: "Artifact rights do not permit commercial release.",
    });
  }
  if (record.rights.expiresAt && Date.parse(record.rights.expiresAt) <= input.now.getTime()) {
    findings.push({
      code: "ARTIFACT_RIGHTS_EXPIRED",
      severity: "error",
      message: "Artifact rights have expired.",
    });
  }
  if (
    record.rights.deletionRequiredAt
    && Date.parse(record.rights.deletionRequiredAt) <= input.now.getTime()
  ) {
    findings.push({
      code: "ARTIFACT_DELETION_DEADLINE_REACHED",
      severity: "error",
      message: "Artifact has reached its mandatory deletion date and cannot be used.",
    });
  }
  return findings;
}

export function assessQueueCompletionArtifacts(
  job: GenerationJob,
  records: readonly ArtifactRecord[],
  options: Readonly<{
    intendedUse?: ProjectUse;
    commercial?: boolean;
    now?: Date;
  }> = {},
): ArtifactGateAssessment {
  validateGenerationJob(job);
  const findings: Finding[] = [];
  const ids = new Set<string>();
  const takeIds = new Set<string>();
  const byId = new Map<string, ArtifactRecord>();
  const now = options.now ?? new Date();
  const intendedUse = options.intendedUse ?? "audiobook";
  const commercial = options.commercial ?? true;

  if (job.status !== "ready") {
    findings.push({
      code: "ARTIFACT_JOB_NOT_READY",
      severity: "error",
      message: "Blocked generation intent cannot complete through artifact admission.",
    });
  }
  if (records.length === 0) {
    findings.push({
      code: "ARTIFACT_COMPLETION_RECORDS_REQUIRED",
      severity: "error",
      message: "Generation completion requires verified artifact records.",
    });
  }

  for (const record of records) {
    try {
      assertArtifactRecord(record);
    } catch (error) {
      findings.push({
        code: "ARTIFACT_RECORD_INVALID",
        severity: "error",
        message: error instanceof Error ? error.message : "Artifact record is invalid.",
      });
      continue;
    }
    if (ids.has(record.id)) {
      findings.push({ code: "ARTIFACT_COMPLETION_ID_DUPLICATE", severity: "error", message: `Duplicate artifact record ${record.id}.` });
      continue;
    }
    ids.add(record.id);
    byId.set(record.id, record);
    if (record.projectId !== job.projectId || record.jobId !== job.id || record.segmentId !== job.segmentId) {
      findings.push({
        code: "ARTIFACT_COMPLETION_SCOPE_MISMATCH",
        severity: "error",
        message: `Artifact ${record.id} is bound to a different project, job or segment.`,
      });
    }
    if (record.verification.status !== "verified") {
      findings.push({
        code: "ARTIFACT_COMPLETION_NOT_VERIFIED",
        severity: "error",
        message: `Artifact ${record.id} has not passed integrity verification.`,
      });
    }
    findings.push(...rightsFindings(record, { intendedUse, commercial, now }));
    for (const parentId of record.provenance.parentArtifactIds) {
      if (!records.some((candidate) => candidate.id === parentId)) {
        findings.push({
          code: "ARTIFACT_COMPLETION_PARENT_MISSING",
          severity: "error",
          message: `Artifact ${record.id} references parent ${parentId} outside the completion bundle.`,
        });
      }
    }
    if (record.kind === "audio-candidate") {
      if (!record.takeId) {
        findings.push({ code: "ARTIFACT_TAKE_ID_REQUIRED", severity: "error", message: `Audio candidate ${record.id} has no take identifier.` });
      } else if (takeIds.has(record.takeId)) {
        findings.push({ code: "ARTIFACT_TAKE_ID_DUPLICATE", severity: "error", message: `Duplicate candidate take ${record.takeId}.` });
      } else {
        takeIds.add(record.takeId);
      }
    }
  }

  const candidateCount = records.filter((record) => record.kind === "audio-candidate").length;
  if (candidateCount !== job.candidateCount) {
    findings.push({
      code: "ARTIFACT_CANDIDATE_COUNT_MISMATCH",
      severity: "error",
      message: `Expected ${job.candidateCount} verified audio candidates, received ${candidateCount}.`,
    });
  }

  return {
    ok: !findings.some((finding) => finding.severity === "error"),
    artifactIds: Object.freeze([...byId.keys()].sort((left, right) => left.localeCompare(right, "en-AU"))),
    findings: Object.freeze(findings),
  };
}

export function assessArtifactRelease(
  records: readonly ArtifactRecord[],
  releaseArtifactId: string,
  input: Readonly<{
    finalConfirmationId: string;
    intendedUse?: ProjectUse;
    commercial?: boolean;
    now?: Date;
  }>,
): ArtifactGateAssessment {
  requireIdentifier(releaseArtifactId, "ARTIFACT_RELEASE_ID_INVALID");
  requireIdentifier(input.finalConfirmationId, "ARTIFACT_FINAL_CONFIRMATION_ID_INVALID");
  const findings: Finding[] = [];
  const byId = new Map<string, ArtifactRecord>();
  const now = input.now ?? new Date();
  const intendedUse = input.intendedUse ?? "audiobook";
  const commercial = input.commercial ?? true;

  for (const record of records) {
    try {
      assertArtifactRecord(record);
      if (byId.has(record.id)) {
        findings.push({ code: "ARTIFACT_RELEASE_ID_DUPLICATE", severity: "error", message: `Duplicate artifact record ${record.id}.` });
      } else {
        byId.set(record.id, record);
      }
    } catch (error) {
      findings.push({
        code: "ARTIFACT_RELEASE_RECORD_INVALID",
        severity: "error",
        message: error instanceof Error ? error.message : "Artifact record is invalid.",
      });
    }
  }

  const release = byId.get(releaseArtifactId);
  if (!release) {
    findings.push({ code: "ARTIFACT_RELEASE_PACKAGE_MISSING", severity: "error", message: "Release package artifact was not found." });
    return { ok: false, artifactIds: Object.freeze([]), findings: Object.freeze(findings) };
  }
  if (release.kind !== "release-package") {
    findings.push({ code: "ARTIFACT_RELEASE_KIND_INVALID", severity: "error", message: "Only a release-package artifact can be released." });
  }

  const visited = new Set<string>();
  const visiting = new Set<string>();
  const walk = (record: ArtifactRecord): void => {
    if (visited.has(record.id)) return;
    if (visiting.has(record.id)) {
      findings.push({ code: "ARTIFACT_RELEASE_DEPENDENCY_CYCLE", severity: "error", message: `Artifact dependency cycle includes ${record.id}.` });
      return;
    }
    visiting.add(record.id);
    if (record.projectId !== release.projectId) {
      findings.push({ code: "ARTIFACT_RELEASE_PROJECT_MISMATCH", severity: "error", message: `Artifact ${record.id} belongs to a different project.` });
    }
    if (record.verification.status !== "verified") {
      findings.push({ code: "ARTIFACT_RELEASE_NOT_VERIFIED", severity: "error", message: `Artifact ${record.id} is not verified.` });
    }
    if (record.review.required && record.review.status !== "approved") {
      findings.push({ code: "ARTIFACT_RELEASE_REVIEW_PENDING", severity: "error", message: `Artifact ${record.id} does not have an approved human review.` });
    }
    findings.push(...rightsFindings(record, { intendedUse, commercial, now }));
    for (const parentId of record.provenance.parentArtifactIds) {
      const parent = byId.get(parentId);
      if (!parent) {
        findings.push({ code: "ARTIFACT_RELEASE_PARENT_MISSING", severity: "error", message: `Artifact ${record.id} is missing dependency ${parentId}.` });
      } else {
        walk(parent);
      }
    }
    visiting.delete(record.id);
    visited.add(record.id);
  };
  walk(release);

  if (![...visited].some((id) => byId.get(id)?.kind === "mastered-chapter")) {
    findings.push({
      code: "ARTIFACT_RELEASE_MASTERED_CHAPTER_REQUIRED",
      severity: "error",
      message: "Audiobook release package must depend on at least one verified and approved mastered chapter.",
    });
  }

  return {
    ok: !findings.some((finding) => finding.severity === "error"),
    artifactIds: Object.freeze([...visited].sort((left, right) => left.localeCompare(right, "en-AU"))),
    findings: Object.freeze(findings),
  };
}

export function confirmArtifactRelease(
  records: readonly ArtifactRecord[],
  releaseArtifactId: string,
  input: Readonly<{
    finalConfirmationId: string;
    releasedByActorId: string;
    intendedUse?: ProjectUse;
    commercial?: boolean;
    releasedAt?: Date;
  }>,
): ArtifactRecord {
  requireIdentifier(input.releasedByActorId, "ARTIFACT_RELEASE_ACTOR_INVALID");
  const releasedAt = input.releasedAt ?? new Date();
  const assessment = assessArtifactRelease(records, releaseArtifactId, {
    finalConfirmationId: input.finalConfirmationId,
    ...(input.intendedUse ? { intendedUse: input.intendedUse } : {}),
    ...(input.commercial !== undefined ? { commercial: input.commercial } : {}),
    now: releasedAt,
  });
  if (!assessment.ok) {
    throw new Error(`ARTIFACT_RELEASE_BLOCKED:${assessment.findings.filter((finding) => finding.severity === "error").map((finding) => finding.code).join(",")}`);
  }
  const release = records.find((record) => record.id === releaseArtifactId);
  if (!release) throw new Error("ARTIFACT_RELEASE_PACKAGE_MISSING");
  if (release.release.status === "released") return release;
  return reviseArtifact(release, {
    release: {
      status: "released",
      finalConfirmationId: input.finalConfirmationId,
      releasedByActorId: input.releasedByActorId,
      releasedAt: releasedAt.toISOString(),
    },
  }, releasedAt);
}

export function artifactPublicView(record: ArtifactRecord): ArtifactPublicView {
  assertArtifactRecord(record);
  return {
    id: record.id,
    kind: record.kind,
    projectId: record.projectId,
    ...(record.jobId ? { jobId: record.jobId } : {}),
    ...(record.segmentId ? { segmentId: record.segmentId } : {}),
    ...(record.takeId ? { takeId: record.takeId } : {}),
    storage: {
      driver: record.storage.driver,
      provider: record.storage.provider,
      ...(record.storage.region ? { region: record.storage.region } : {}),
    },
    integrity: record.integrity,
    ...(record.provenance.providerId
      ? {
          provider: {
            providerId: record.provenance.providerId,
            ...(record.provenance.adapterVersion
              ? { adapterVersion: record.provenance.adapterVersion }
              : {}),
          },
        }
      : {}),
    parentArtifactIds: record.provenance.parentArtifactIds,
    verification: record.verification,
    review: record.review,
    release: record.release,
    revision: record.revision,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    fingerprint: record.fingerprint,
  };
}
