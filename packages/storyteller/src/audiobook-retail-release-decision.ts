import type { ArtifactRightsSnapshot } from "./artifact-registry.js";
import {
  assertAudiobookRetailPackageInspectionEvidence,
  type AudiobookRetailPackageInspectionEvidence,
} from "./audiobook-retail-package-inspection.js";
import {
  assertAudiobookRetailPackageManifest,
  type AudiobookRetailPackageManifest,
} from "./audiobook-retail-package-manifest.js";
import {
  assertAudiobookRetailPackageReviewSession,
  type AudiobookRetailPackageReviewEntry,
  type AudiobookRetailPackageReviewSession,
} from "./audiobook-retail-package-review.js";
import {
  assertAudiobookRetailEncodingPolicy,
  assertAudiobookRetailNarrationEligibilityEvidence,
  assertCurrentAudiobookRetailEncodingPolicy,
  type AudiobookRetailEncodingPolicy,
  type AudiobookRetailNarrationEligibilityEvidence,
  type AudiobookRetailNarrationSourceKind,
} from "./audiobook-retail-policy.js";
import {
  assertAudiobookRetailTrackPlan,
  type AudiobookRetailTrackPlan,
} from "./audiobook-retail-track-plan.js";
import { stableHash } from "./index.js";
import {
  FileProjectStore,
  StoreConflictError,
  type StoredEnvelope,
} from "./project-store.js";

export const AUDIOBOOK_RETAIL_DISTRIBUTOR_ACCOUNT_SCHEMA_VERSION =
  "storyteller-audiobook-retail-distributor-account-v1" as const;
export const AUDIOBOOK_RETAIL_RELEASE_DECISION_SCHEMA_VERSION =
  "storyteller-audiobook-retail-release-decision-v1" as const;
export const AUDIOBOOK_RETAIL_RELEASE_DECISION_ENTITY_TYPE =
  "audiobook-retail-release-decision" as const;

export type AudiobookRetailDeliveryMethod = "manual-acx-upload";

export interface AudiobookRetailDistributorAccountEvidence {
  schemaVersion: typeof AUDIOBOOK_RETAIL_DISTRIBUTOR_ACCOUNT_SCHEMA_VERSION;
  id: string;
  distributor: "acx-audible";
  projectId: string;
  bookId: string;
  accountReferenceHash: string;
  permission: "upload-audiobook-files";
  verifiedByActorId: string;
  verifiedAt: string;
  expiresAt: string;
  status: "verified";
  fingerprint: string;
}

export interface AudiobookRetailReleaseDecision {
  schemaVersion: typeof AUDIOBOOK_RETAIL_RELEASE_DECISION_SCHEMA_VERSION;
  id: string;
  projectId: string;
  bookId: string;
  distributor: "acx-audible";
  packageReview: Readonly<{
    id: string;
    revision: number;
    fingerprint: string;
    approvalFingerprint: string;
    approvedAt: string;
  }>;
  inspection: Readonly<{
    id: string;
    revision: 1;
    fingerprint: string;
  }>;
  packageManifest: Readonly<{
    id: string;
    revision: 1;
    fingerprint: string;
  }>;
  trackPlan: Readonly<{
    id: string;
    fingerprint: string;
  }>;
  policy: Readonly<{
    id: string;
    externalVersion: string;
    reviewedAt: string;
    expiresAt: string;
    fingerprint: string;
  }>;
  rightsFingerprint: string;
  narration: Readonly<{
    evidenceId: string;
    sourceKind: AudiobookRetailNarrationSourceKind;
    evidenceFingerprint: string;
    platformAuthorisationPresent: boolean;
    platformAuthorisationFingerprint?: string;
  }>;
  distributorAccount: Readonly<{
    evidenceId: string;
    evidenceFingerprint: string;
    accessExpiresAt: string;
  }>;
  package: Readonly<{
    mediaFileCount: number;
    totalMediaBytes: number;
    totalPackageBytes: number;
    fileSetFingerprint: string;
  }>;
  finalConfirmationId: string;
  decidedByActorId: string;
  humanConfirmation: true;
  deliveryMethod: AudiobookRetailDeliveryMethod;
  maximumDeliveryAttempts: 1;
  decidedAt: string;
  validUntil: string;
  status: "authorized-for-controlled-delivery";
  revision: 1;
  fingerprint: string;
}

export interface AudiobookRetailReleaseDecisionPublicView {
  id: string;
  bookId: string;
  distributor: "acx-audible";
  policyVersion: string;
  narrationSourceKind: AudiobookRetailNarrationSourceKind;
  platformAuthorisationPresent: boolean;
  mediaFileCount: number;
  totalPackageBytes: number;
  deliveryMethod: AudiobookRetailDeliveryMethod;
  maximumDeliveryAttempts: 1;
  decidedAt: string;
  validUntil: string;
  status: "authorized-for-controlled-delivery";
  revision: 1;
  fingerprint: string;
}

export interface CreateAudiobookRetailReleaseDecisionInput {
  id?: string;
  packageReview: AudiobookRetailPackageReviewSession;
  inspection: AudiobookRetailPackageInspectionEvidence;
  packageManifest: AudiobookRetailPackageManifest;
  trackPlan: AudiobookRetailTrackPlan;
  policy: AudiobookRetailEncodingPolicy;
  narration: AudiobookRetailNarrationEligibilityEvidence;
  rights: ArtifactRightsSnapshot;
  distributorAccount: AudiobookRetailDistributorAccountEvidence;
  finalConfirmationId: string;
  decidedByActorId: string;
  humanConfirmation: true;
  deliveryMethod: AudiobookRetailDeliveryMethod;
  validUntil: string;
  decidedAt?: Date;
}

export class AudiobookRetailReleaseDecisionError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "AudiobookRetailReleaseDecisionError";
    this.code = code;
  }
}

export class AudiobookRetailReleaseDecisionStoreConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AudiobookRetailReleaseDecisionStoreConflictError";
  }
}

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const HUMAN_BLOCKLIST = /^(?:system|worker|automation|automated|bot)(?:[_-]|$)/iu;
const MAXIMUM_ACCOUNT_EVIDENCE_LIFETIME_MS = 31 * 24 * 60 * 60 * 1_000;
const MAXIMUM_DECISION_LIFETIME_MS = 72 * 60 * 60 * 1_000;
const MAXIMUM_FILES = 2_003;
const MAXIMUM_BYTES = 16 * 1024 * 1024 * 1024;

function requireIdentifier(value: string, code: string): string {
  if (!SAFE_IDENTIFIER.test(value)) {
    throw new AudiobookRetailReleaseDecisionError(code);
  }
  return value;
}

function requireHumanActor(value: string, code: string): string {
  requireIdentifier(value, code);
  if (HUMAN_BLOCKLIST.test(value)) {
    throw new AudiobookRetailReleaseDecisionError(code);
  }
  return value;
}

function requireHash(value: string, code: string): string {
  if (!HASH_PATTERN.test(value)) {
    throw new AudiobookRetailReleaseDecisionError(code);
  }
  return value;
}

function requireDate(value: string, code: string): string {
  if (!value || Number.isNaN(Date.parse(value))) {
    throw new AudiobookRetailReleaseDecisionError(code);
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
    throw new AudiobookRetailReleaseDecisionError(code);
  }
  return value;
}

function accountFingerprint(
  value: Omit<AudiobookRetailDistributorAccountEvidence, "fingerprint">,
): string {
  return stableHash(value);
}

function decisionFingerprint(
  value: Omit<AudiobookRetailReleaseDecision, "fingerprint">,
): string {
  return stableHash(value);
}

function fileSetFingerprint(
  review: AudiobookRetailPackageReviewSession,
): string {
  return stableHash(review.files.map((file) => ({
    ordinal: file.ordinal,
    kind: file.kind,
    role: file.role,
    fileName: file.fileName,
    contentHash: file.contentHash,
    byteCount: file.byteCount,
    fingerprint: file.fingerprint,
  })));
}

function latestPackageReviewers(
  review: AudiobookRetailPackageReviewSession,
): readonly AudiobookRetailPackageReviewEntry[] {
  const latest = new Map<AudiobookRetailPackageReviewEntry["role"], AudiobookRetailPackageReviewEntry>();
  for (const entry of review.reviews) latest.set(entry.role, entry);
  return Object.freeze([...latest.values()]);
}

function assertCurrentRights(
  rights: ArtifactRightsSnapshot,
  rightsFingerprint: string,
  now: Date,
): void {
  requireIdentifier(
    rights.rightsEvidenceId,
    "AUDIOBOOK_RETAIL_RELEASE_DECISION_RIGHTS_ID_INVALID",
  );
  requireHash(
    rights.rightsFingerprint,
    "AUDIOBOOK_RETAIL_RELEASE_DECISION_RIGHTS_HASH_INVALID",
  );
  if (
    rights.rightsFingerprint !== rightsFingerprint
    || !rights.allowedUses.includes("audiobook")
  ) {
    throw new AudiobookRetailReleaseDecisionError(
      "AUDIOBOOK_RETAIL_RELEASE_DECISION_RIGHTS_SCOPE_MISMATCH",
    );
  }
  if (!rights.commercialUseApproved) {
    throw new AudiobookRetailReleaseDecisionError(
      "AUDIOBOOK_RETAIL_RELEASE_DECISION_COMMERCIAL_RIGHTS_REQUIRED",
    );
  }
  if (rights.expiresAt && Date.parse(rights.expiresAt) <= now.getTime()) {
    throw new AudiobookRetailReleaseDecisionError(
      "AUDIOBOOK_RETAIL_RELEASE_DECISION_RIGHTS_EXPIRED",
    );
  }
  if (
    rights.deletionRequiredAt
    && Date.parse(rights.deletionRequiredAt) <= now.getTime()
  ) {
    throw new AudiobookRetailReleaseDecisionError(
      "AUDIOBOOK_RETAIL_RELEASE_DECISION_RETENTION_EXPIRED",
    );
  }
}

function decisionExpiryCeiling(
  input: CreateAudiobookRetailReleaseDecisionInput,
  decidedAt: Date,
): number {
  const values = [
    decidedAt.getTime() + MAXIMUM_DECISION_LIFETIME_MS,
    Date.parse(input.policy.expiresAt),
    Date.parse(input.distributorAccount.expiresAt),
  ];
  if (input.rights.expiresAt) values.push(Date.parse(input.rights.expiresAt));
  if (input.rights.deletionRequiredAt) {
    values.push(Date.parse(input.rights.deletionRequiredAt));
  }
  if (input.narration.platformAuthorisation) {
    values.push(Date.parse(input.narration.platformAuthorisation.expiresAt));
  }
  return Math.min(...values);
}

export function createAudiobookRetailDistributorAccountEvidence(input: Readonly<{
  id: string;
  projectId: string;
  bookId: string;
  accountReferenceHash: string;
  verifiedByActorId: string;
  verifiedAt: string;
  expiresAt: string;
  now?: Date;
}>): AudiobookRetailDistributorAccountEvidence {
  const now = input.now ?? new Date();
  if (Number.isNaN(now.getTime())) {
    throw new AudiobookRetailReleaseDecisionError(
      "AUDIOBOOK_RETAIL_ACCOUNT_DATE_INVALID",
    );
  }
  const verifiedAt = Date.parse(requireDate(
    input.verifiedAt,
    "AUDIOBOOK_RETAIL_ACCOUNT_DATE_INVALID",
  ));
  const expiresAt = Date.parse(requireDate(
    input.expiresAt,
    "AUDIOBOOK_RETAIL_ACCOUNT_DATE_INVALID",
  ));
  if (
    verifiedAt > now.getTime()
    || expiresAt <= now.getTime()
    || expiresAt <= verifiedAt
    || expiresAt - verifiedAt > MAXIMUM_ACCOUNT_EVIDENCE_LIFETIME_MS
  ) {
    throw new AudiobookRetailReleaseDecisionError(
      "AUDIOBOOK_RETAIL_ACCOUNT_NOT_CURRENT",
    );
  }
  const partial: Omit<AudiobookRetailDistributorAccountEvidence, "fingerprint"> = {
    schemaVersion: AUDIOBOOK_RETAIL_DISTRIBUTOR_ACCOUNT_SCHEMA_VERSION,
    id: requireIdentifier(input.id, "AUDIOBOOK_RETAIL_ACCOUNT_ID_INVALID"),
    distributor: "acx-audible",
    projectId: requireIdentifier(
      input.projectId,
      "AUDIOBOOK_RETAIL_ACCOUNT_PROJECT_ID_INVALID",
    ),
    bookId: requireIdentifier(
      input.bookId,
      "AUDIOBOOK_RETAIL_ACCOUNT_BOOK_ID_INVALID",
    ),
    accountReferenceHash: requireHash(
      input.accountReferenceHash,
      "AUDIOBOOK_RETAIL_ACCOUNT_REFERENCE_HASH_INVALID",
    ),
    permission: "upload-audiobook-files",
    verifiedByActorId: requireHumanActor(
      input.verifiedByActorId,
      "AUDIOBOOK_RETAIL_ACCOUNT_VERIFIER_INVALID",
    ),
    verifiedAt: input.verifiedAt,
    expiresAt: input.expiresAt,
    status: "verified",
  };
  const evidence = Object.freeze({
    ...partial,
    fingerprint: accountFingerprint(partial),
  });
  assertAudiobookRetailDistributorAccountEvidence(evidence, now);
  return evidence;
}

export function assertAudiobookRetailDistributorAccountEvidence(
  evidence: AudiobookRetailDistributorAccountEvidence,
  now = new Date(),
): void {
  if (
    evidence.schemaVersion !== AUDIOBOOK_RETAIL_DISTRIBUTOR_ACCOUNT_SCHEMA_VERSION
  ) {
    throw new AudiobookRetailReleaseDecisionError(
      "AUDIOBOOK_RETAIL_ACCOUNT_SCHEMA_UNSUPPORTED",
    );
  }
  for (const [value, code] of [
    [evidence.id, "AUDIOBOOK_RETAIL_ACCOUNT_ID_INVALID"],
    [evidence.projectId, "AUDIOBOOK_RETAIL_ACCOUNT_PROJECT_ID_INVALID"],
    [evidence.bookId, "AUDIOBOOK_RETAIL_ACCOUNT_BOOK_ID_INVALID"],
  ] as const) requireIdentifier(value, code);
  requireHash(
    evidence.accountReferenceHash,
    "AUDIOBOOK_RETAIL_ACCOUNT_REFERENCE_HASH_INVALID",
  );
  requireHumanActor(
    evidence.verifiedByActorId,
    "AUDIOBOOK_RETAIL_ACCOUNT_VERIFIER_INVALID",
  );
  const verifiedAt = Date.parse(requireDate(
    evidence.verifiedAt,
    "AUDIOBOOK_RETAIL_ACCOUNT_DATE_INVALID",
  ));
  const expiresAt = Date.parse(requireDate(
    evidence.expiresAt,
    "AUDIOBOOK_RETAIL_ACCOUNT_DATE_INVALID",
  ));
  if (
    Number.isNaN(now.getTime())
    || evidence.distributor !== "acx-audible"
    || evidence.permission !== "upload-audiobook-files"
    || evidence.status !== "verified"
    || verifiedAt > now.getTime()
    || expiresAt <= now.getTime()
    || expiresAt <= verifiedAt
    || expiresAt - verifiedAt > MAXIMUM_ACCOUNT_EVIDENCE_LIFETIME_MS
  ) {
    throw new AudiobookRetailReleaseDecisionError(
      "AUDIOBOOK_RETAIL_ACCOUNT_NOT_CURRENT",
    );
  }
  const { fingerprint, ...partial } = evidence;
  if (accountFingerprint(partial) !== fingerprint) {
    throw new AudiobookRetailReleaseDecisionError(
      "AUDIOBOOK_RETAIL_ACCOUNT_FINGERPRINT_INVALID",
    );
  }
}

function assertSourceScope(
  input: CreateAudiobookRetailReleaseDecisionInput,
  decidedAt: Date,
): void {
  assertAudiobookRetailPackageReviewSession(input.packageReview);
  assertAudiobookRetailPackageInspectionEvidence(input.inspection);
  assertAudiobookRetailPackageManifest(input.packageManifest);
  assertAudiobookRetailTrackPlan(input.trackPlan);
  assertAudiobookRetailEncodingPolicy(input.policy);
  assertCurrentAudiobookRetailEncodingPolicy(input.policy, decidedAt);
  assertAudiobookRetailNarrationEligibilityEvidence(
    input.narration,
    input.policy,
    decidedAt,
  );
  assertAudiobookRetailDistributorAccountEvidence(
    input.distributorAccount,
    decidedAt,
  );
  if (
    input.packageReview.status !== "approved-for-release-decision"
    || !input.packageReview.approval
    || input.packageReview.approval.releaseDecisionEligible !== true
  ) {
    throw new AudiobookRetailReleaseDecisionError(
      "AUDIOBOOK_RETAIL_RELEASE_DECISION_PACKAGE_REVIEW_REQUIRED",
    );
  }
  if (
    input.packageReview.projectId !== input.inspection.projectId
    || input.packageReview.projectId !== input.packageManifest.projectId
    || input.packageReview.projectId !== input.trackPlan.projectId
    || input.packageReview.projectId !== input.narration.projectId
    || input.packageReview.projectId !== input.distributorAccount.projectId
    || input.packageReview.bookId !== input.inspection.bookId
    || input.packageReview.bookId !== input.packageManifest.bookId
    || input.packageReview.bookId !== input.trackPlan.bookId
    || input.packageReview.bookId !== input.narration.bookId
    || input.packageReview.bookId !== input.distributorAccount.bookId
    || input.packageReview.packageId !== input.inspection.packageId
    || input.packageReview.inspection.id !== input.inspection.id
    || input.packageReview.inspection.fingerprint !== input.inspection.fingerprint
    || input.packageReview.sourceManifest.id !== input.packageManifest.id
    || input.packageReview.sourceManifest.fingerprint
      !== input.packageManifest.fingerprint
    || input.packageReview.packageManifestFingerprint
      !== input.inspection.packageManifest.fingerprint
    || input.packageManifest.trackPlan.id !== input.trackPlan.id
    || input.packageManifest.trackPlan.fingerprint !== input.trackPlan.fingerprint
  ) {
    throw new AudiobookRetailReleaseDecisionError(
      "AUDIOBOOK_RETAIL_RELEASE_DECISION_SOURCE_SCOPE_MISMATCH",
    );
  }
  if (
    input.packageReview.policy.id !== input.policy.id
    || input.packageReview.policy.externalVersion !== input.policy.externalVersion
    || input.packageReview.policy.reviewedAt !== input.policy.reviewedAt
    || input.packageReview.policy.expiresAt !== input.policy.expiresAt
    || input.packageReview.policy.fingerprint !== input.policy.fingerprint
    || input.packageManifest.policy.fingerprint !== input.policy.fingerprint
    || input.trackPlan.policy.fingerprint !== input.policy.fingerprint
    || input.narration.policyFingerprint !== input.policy.fingerprint
  ) {
    throw new AudiobookRetailReleaseDecisionError(
      "AUDIOBOOK_RETAIL_RELEASE_DECISION_POLICY_MISMATCH",
    );
  }
  if (
    input.packageReview.rightsFingerprint !== input.rights.rightsFingerprint
    || input.packageManifest.rightsFingerprint !== input.rights.rightsFingerprint
    || input.narration.rightsFingerprint !== input.rights.rightsFingerprint
  ) {
    throw new AudiobookRetailReleaseDecisionError(
      "AUDIOBOOK_RETAIL_RELEASE_DECISION_RIGHTS_SCOPE_MISMATCH",
    );
  }
  if (
    input.trackPlan.narration.evidenceId !== input.narration.id
    || input.trackPlan.narration.sourceKind !== input.narration.sourceKind
    || input.trackPlan.narration.evidenceFingerprint !== input.narration.fingerprint
    || input.trackPlan.narration.platformAuthorisationPresent
      !== (input.narration.platformAuthorisation !== undefined)
  ) {
    throw new AudiobookRetailReleaseDecisionError(
      "AUDIOBOOK_RETAIL_RELEASE_DECISION_NARRATION_MISMATCH",
    );
  }
  assertCurrentRights(input.rights, input.packageReview.rightsFingerprint, decidedAt);
}

export function createAudiobookRetailReleaseDecision(
  input: CreateAudiobookRetailReleaseDecisionInput,
): AudiobookRetailReleaseDecision {
  const decidedAt = input.decidedAt ?? new Date();
  if (Number.isNaN(decidedAt.getTime())) {
    throw new AudiobookRetailReleaseDecisionError(
      "AUDIOBOOK_RETAIL_RELEASE_DECISION_DATE_INVALID",
    );
  }
  if (input.humanConfirmation !== true) {
    throw new AudiobookRetailReleaseDecisionError(
      "AUDIOBOOK_RETAIL_RELEASE_DECISION_HUMAN_CONFIRMATION_REQUIRED",
    );
  }
  if (input.deliveryMethod !== "manual-acx-upload") {
    throw new AudiobookRetailReleaseDecisionError(
      "AUDIOBOOK_RETAIL_RELEASE_DECISION_DELIVERY_METHOD_INVALID",
    );
  }
  const finalConfirmationId = requireIdentifier(
    input.finalConfirmationId,
    "AUDIOBOOK_RETAIL_RELEASE_DECISION_CONFIRMATION_ID_INVALID",
  );
  const decidedByActorId = requireHumanActor(
    input.decidedByActorId,
    "AUDIOBOOK_RETAIL_RELEASE_DECISION_ACTOR_INVALID",
  );
  assertSourceScope(input, decidedAt);
  const packageApproval = input.packageReview.approval!;
  const packageReviewers = latestPackageReviewers(input.packageReview);
  const excludedActors = new Set([
    ...packageReviewers.map((review) => review.reviewerId),
    packageApproval.approvedByActorId,
    input.distributorAccount.verifiedByActorId,
    input.narration.attestedByActorId,
  ]);
  if (excludedActors.has(decidedByActorId)) {
    throw new AudiobookRetailReleaseDecisionError(
      "AUDIOBOOK_RETAIL_RELEASE_DECISION_INDEPENDENT_AUTHORITY_REQUIRED",
    );
  }
  const latestPrerequisite = Math.max(
    Date.parse(packageApproval.approvedAt),
    Date.parse(input.inspection.inspectedAt),
    Date.parse(input.distributorAccount.verifiedAt),
    Date.parse(input.narration.attestedAt),
    Date.parse(input.policy.reviewedAt),
  );
  const validUntil = Date.parse(requireDate(
    input.validUntil,
    "AUDIOBOOK_RETAIL_RELEASE_DECISION_VALIDITY_INVALID",
  ));
  const ceiling = decisionExpiryCeiling(input, decidedAt);
  if (
    decidedAt.getTime() < latestPrerequisite
    || validUntil <= decidedAt.getTime()
    || validUntil > ceiling
  ) {
    throw new AudiobookRetailReleaseDecisionError(
      "AUDIOBOOK_RETAIL_RELEASE_DECISION_VALIDITY_INVALID",
    );
  }
  const derivedId = `retail_release_decision_${stableHash({
    packageReview: input.packageReview.fingerprint,
    inspection: input.inspection.fingerprint,
    narration: input.narration.fingerprint,
    account: input.distributorAccount.fingerprint,
    finalConfirmationId,
    validUntil: input.validUntil,
  }).slice(0, 24)}`;
  const partial: Omit<AudiobookRetailReleaseDecision, "fingerprint"> = {
    schemaVersion: AUDIOBOOK_RETAIL_RELEASE_DECISION_SCHEMA_VERSION,
    id: requireIdentifier(
      input.id ?? derivedId,
      "AUDIOBOOK_RETAIL_RELEASE_DECISION_ID_INVALID",
    ),
    projectId: input.packageReview.projectId,
    bookId: input.packageReview.bookId,
    distributor: "acx-audible",
    packageReview: Object.freeze({
      id: input.packageReview.id,
      revision: input.packageReview.revision,
      fingerprint: input.packageReview.fingerprint,
      approvalFingerprint: packageApproval.fingerprint,
      approvedAt: packageApproval.approvedAt,
    }),
    inspection: Object.freeze({
      id: input.inspection.id,
      revision: 1,
      fingerprint: input.inspection.fingerprint,
    }),
    packageManifest: Object.freeze({
      id: input.packageManifest.id,
      revision: 1,
      fingerprint: input.packageManifest.fingerprint,
    }),
    trackPlan: Object.freeze({
      id: input.trackPlan.id,
      fingerprint: input.trackPlan.fingerprint,
    }),
    policy: Object.freeze({
      id: input.policy.id,
      externalVersion: input.policy.externalVersion,
      reviewedAt: input.policy.reviewedAt,
      expiresAt: input.policy.expiresAt,
      fingerprint: input.policy.fingerprint,
    }),
    rightsFingerprint: input.rights.rightsFingerprint,
    narration: Object.freeze({
      evidenceId: input.narration.id,
      sourceKind: input.narration.sourceKind,
      evidenceFingerprint: input.narration.fingerprint,
      platformAuthorisationPresent:
        input.narration.platformAuthorisation !== undefined,
      ...(input.narration.platformAuthorisation
        ? {
            platformAuthorisationFingerprint:
              input.narration.platformAuthorisation.fingerprint,
          }
        : {}),
    }),
    distributorAccount: Object.freeze({
      evidenceId: input.distributorAccount.id,
      evidenceFingerprint: input.distributorAccount.fingerprint,
      accessExpiresAt: input.distributorAccount.expiresAt,
    }),
    package: Object.freeze({
      mediaFileCount: input.packageReview.mediaFileCount,
      totalMediaBytes: input.packageReview.totalMediaBytes,
      totalPackageBytes: input.packageReview.totalPackageBytes,
      fileSetFingerprint: fileSetFingerprint(input.packageReview),
    }),
    finalConfirmationId,
    decidedByActorId,
    humanConfirmation: true,
    deliveryMethod: "manual-acx-upload",
    maximumDeliveryAttempts: 1,
    decidedAt: decidedAt.toISOString(),
    validUntil: input.validUntil,
    status: "authorized-for-controlled-delivery",
    revision: 1,
  };
  const decision = Object.freeze({
    ...partial,
    fingerprint: decisionFingerprint(partial),
  });
  assertAudiobookRetailReleaseDecision(decision);
  assertAudiobookRetailReleaseDecisionMatchesSources(decision, input);
  return decision;
}

export function assertAudiobookRetailReleaseDecision(
  decision: AudiobookRetailReleaseDecision,
): void {
  if (decision.schemaVersion !== AUDIOBOOK_RETAIL_RELEASE_DECISION_SCHEMA_VERSION) {
    throw new AudiobookRetailReleaseDecisionError(
      "AUDIOBOOK_RETAIL_RELEASE_DECISION_SCHEMA_UNSUPPORTED",
    );
  }
  for (const [value, code] of [
    [decision.id, "AUDIOBOOK_RETAIL_RELEASE_DECISION_ID_INVALID"],
    [decision.projectId, "AUDIOBOOK_RETAIL_RELEASE_DECISION_PROJECT_ID_INVALID"],
    [decision.bookId, "AUDIOBOOK_RETAIL_RELEASE_DECISION_BOOK_ID_INVALID"],
    [decision.packageReview.id, "AUDIOBOOK_RETAIL_RELEASE_DECISION_REVIEW_ID_INVALID"],
    [decision.inspection.id, "AUDIOBOOK_RETAIL_RELEASE_DECISION_INSPECTION_ID_INVALID"],
    [decision.packageManifest.id, "AUDIOBOOK_RETAIL_RELEASE_DECISION_MANIFEST_ID_INVALID"],
    [decision.trackPlan.id, "AUDIOBOOK_RETAIL_RELEASE_DECISION_TRACK_PLAN_ID_INVALID"],
    [decision.policy.id, "AUDIOBOOK_RETAIL_RELEASE_DECISION_POLICY_ID_INVALID"],
    [decision.narration.evidenceId, "AUDIOBOOK_RETAIL_RELEASE_DECISION_NARRATION_ID_INVALID"],
    [decision.distributorAccount.evidenceId, "AUDIOBOOK_RETAIL_RELEASE_DECISION_ACCOUNT_ID_INVALID"],
    [decision.finalConfirmationId, "AUDIOBOOK_RETAIL_RELEASE_DECISION_CONFIRMATION_ID_INVALID"],
  ] as const) requireIdentifier(value, code);
  requireHumanActor(
    decision.decidedByActorId,
    "AUDIOBOOK_RETAIL_RELEASE_DECISION_ACTOR_INVALID",
  );
  for (const [value, code] of [
    [decision.packageReview.fingerprint, "AUDIOBOOK_RETAIL_RELEASE_DECISION_REVIEW_HASH_INVALID"],
    [decision.packageReview.approvalFingerprint, "AUDIOBOOK_RETAIL_RELEASE_DECISION_APPROVAL_HASH_INVALID"],
    [decision.inspection.fingerprint, "AUDIOBOOK_RETAIL_RELEASE_DECISION_INSPECTION_HASH_INVALID"],
    [decision.packageManifest.fingerprint, "AUDIOBOOK_RETAIL_RELEASE_DECISION_MANIFEST_HASH_INVALID"],
    [decision.trackPlan.fingerprint, "AUDIOBOOK_RETAIL_RELEASE_DECISION_TRACK_PLAN_HASH_INVALID"],
    [decision.policy.fingerprint, "AUDIOBOOK_RETAIL_RELEASE_DECISION_POLICY_HASH_INVALID"],
    [decision.rightsFingerprint, "AUDIOBOOK_RETAIL_RELEASE_DECISION_RIGHTS_HASH_INVALID"],
    [decision.narration.evidenceFingerprint, "AUDIOBOOK_RETAIL_RELEASE_DECISION_NARRATION_HASH_INVALID"],
    [decision.distributorAccount.evidenceFingerprint, "AUDIOBOOK_RETAIL_RELEASE_DECISION_ACCOUNT_HASH_INVALID"],
    [decision.package.fileSetFingerprint, "AUDIOBOOK_RETAIL_RELEASE_DECISION_FILE_SET_HASH_INVALID"],
  ] as const) requireHash(value, code);
  if (decision.narration.platformAuthorisationPresent) {
    requireHash(
      decision.narration.platformAuthorisationFingerprint ?? "",
      "AUDIOBOOK_RETAIL_RELEASE_DECISION_AUTHORISATION_HASH_INVALID",
    );
  } else if (decision.narration.platformAuthorisationFingerprint !== undefined) {
    throw new AudiobookRetailReleaseDecisionError(
      "AUDIOBOOK_RETAIL_RELEASE_DECISION_AUTHORISATION_STATE_INVALID",
    );
  }
  requireInteger(
    decision.packageReview.revision,
    1,
    Number.MAX_SAFE_INTEGER,
    "AUDIOBOOK_RETAIL_RELEASE_DECISION_REVIEW_REVISION_INVALID",
  );
  if (decision.inspection.revision !== 1 || decision.packageManifest.revision !== 1) {
    throw new AudiobookRetailReleaseDecisionError(
      "AUDIOBOOK_RETAIL_RELEASE_DECISION_SOURCE_REVISION_INVALID",
    );
  }
  requireInteger(
    decision.package.mediaFileCount,
    4,
    MAXIMUM_FILES,
    "AUDIOBOOK_RETAIL_RELEASE_DECISION_FILE_COUNT_INVALID",
  );
  requireInteger(
    decision.package.totalMediaBytes,
    1,
    MAXIMUM_BYTES,
    "AUDIOBOOK_RETAIL_RELEASE_DECISION_SIZE_INVALID",
  );
  requireInteger(
    decision.package.totalPackageBytes,
    decision.package.totalMediaBytes + 1,
    MAXIMUM_BYTES + 32 * 1024 * 1024,
    "AUDIOBOOK_RETAIL_RELEASE_DECISION_SIZE_INVALID",
  );
  for (const value of [
    decision.packageReview.approvedAt,
    decision.policy.reviewedAt,
    decision.policy.expiresAt,
    decision.distributorAccount.accessExpiresAt,
    decision.decidedAt,
    decision.validUntil,
  ]) requireDate(value, "AUDIOBOOK_RETAIL_RELEASE_DECISION_DATE_INVALID");
  if (
    decision.distributor !== "acx-audible"
    || decision.deliveryMethod !== "manual-acx-upload"
    || decision.maximumDeliveryAttempts !== 1
    || decision.humanConfirmation !== true
    || decision.status !== "authorized-for-controlled-delivery"
    || decision.revision !== 1
    || Date.parse(decision.decidedAt) < Date.parse(decision.packageReview.approvedAt)
    || Date.parse(decision.validUntil) <= Date.parse(decision.decidedAt)
    || Date.parse(decision.validUntil)
      > Date.parse(decision.decidedAt) + MAXIMUM_DECISION_LIFETIME_MS
    || Date.parse(decision.validUntil) > Date.parse(decision.policy.expiresAt)
    || Date.parse(decision.validUntil)
      > Date.parse(decision.distributorAccount.accessExpiresAt)
  ) {
    throw new AudiobookRetailReleaseDecisionError(
      "AUDIOBOOK_RETAIL_RELEASE_DECISION_STATE_INVALID",
    );
  }
  const { fingerprint, ...partial } = decision;
  if (decisionFingerprint(partial) !== fingerprint) {
    throw new AudiobookRetailReleaseDecisionError(
      "AUDIOBOOK_RETAIL_RELEASE_DECISION_FINGERPRINT_INVALID",
    );
  }
}

export function assertAudiobookRetailReleaseDecisionMatchesSources(
  decision: AudiobookRetailReleaseDecision,
  input: CreateAudiobookRetailReleaseDecisionInput,
): void {
  assertAudiobookRetailReleaseDecision(decision);
  const decidedAt = new Date(decision.decidedAt);
  assertSourceScope(input, decidedAt);
  const expected = createAudiobookRetailReleaseDecisionUnchecked({
    ...input,
    id: decision.id,
    decidedAt,
    validUntil: decision.validUntil,
  });
  if (expected.fingerprint !== decision.fingerprint) {
    throw new AudiobookRetailReleaseDecisionError(
      "AUDIOBOOK_RETAIL_RELEASE_DECISION_SOURCE_MISMATCH",
    );
  }
}

let constructingUnchecked = false;

function createAudiobookRetailReleaseDecisionUnchecked(
  input: CreateAudiobookRetailReleaseDecisionInput,
): AudiobookRetailReleaseDecision {
  const previous = constructingUnchecked;
  constructingUnchecked = true;
  try {
    return createAudiobookRetailReleaseDecisionInternal(input);
  } finally {
    constructingUnchecked = previous;
  }
}

function createAudiobookRetailReleaseDecisionInternal(
  input: CreateAudiobookRetailReleaseDecisionInput,
): AudiobookRetailReleaseDecision {
  if (!constructingUnchecked) return createAudiobookRetailReleaseDecision(input);
  const decidedAt = input.decidedAt ?? new Date();
  assertSourceScope(input, decidedAt);
  const packageApproval = input.packageReview.approval!;
  const partial: Omit<AudiobookRetailReleaseDecision, "fingerprint"> = {
    schemaVersion: AUDIOBOOK_RETAIL_RELEASE_DECISION_SCHEMA_VERSION,
    id: input.id!,
    projectId: input.packageReview.projectId,
    bookId: input.packageReview.bookId,
    distributor: "acx-audible",
    packageReview: Object.freeze({
      id: input.packageReview.id,
      revision: input.packageReview.revision,
      fingerprint: input.packageReview.fingerprint,
      approvalFingerprint: packageApproval.fingerprint,
      approvedAt: packageApproval.approvedAt,
    }),
    inspection: Object.freeze({
      id: input.inspection.id,
      revision: 1,
      fingerprint: input.inspection.fingerprint,
    }),
    packageManifest: Object.freeze({
      id: input.packageManifest.id,
      revision: 1,
      fingerprint: input.packageManifest.fingerprint,
    }),
    trackPlan: Object.freeze({
      id: input.trackPlan.id,
      fingerprint: input.trackPlan.fingerprint,
    }),
    policy: Object.freeze({
      id: input.policy.id,
      externalVersion: input.policy.externalVersion,
      reviewedAt: input.policy.reviewedAt,
      expiresAt: input.policy.expiresAt,
      fingerprint: input.policy.fingerprint,
    }),
    rightsFingerprint: input.rights.rightsFingerprint,
    narration: Object.freeze({
      evidenceId: input.narration.id,
      sourceKind: input.narration.sourceKind,
      evidenceFingerprint: input.narration.fingerprint,
      platformAuthorisationPresent:
        input.narration.platformAuthorisation !== undefined,
      ...(input.narration.platformAuthorisation
        ? {
            platformAuthorisationFingerprint:
              input.narration.platformAuthorisation.fingerprint,
          }
        : {}),
    }),
    distributorAccount: Object.freeze({
      evidenceId: input.distributorAccount.id,
      evidenceFingerprint: input.distributorAccount.fingerprint,
      accessExpiresAt: input.distributorAccount.expiresAt,
    }),
    package: Object.freeze({
      mediaFileCount: input.packageReview.mediaFileCount,
      totalMediaBytes: input.packageReview.totalMediaBytes,
      totalPackageBytes: input.packageReview.totalPackageBytes,
      fileSetFingerprint: fileSetFingerprint(input.packageReview),
    }),
    finalConfirmationId: input.finalConfirmationId,
    decidedByActorId: input.decidedByActorId,
    humanConfirmation: true,
    deliveryMethod: "manual-acx-upload",
    maximumDeliveryAttempts: 1,
    decidedAt: decidedAt.toISOString(),
    validUntil: input.validUntil,
    status: "authorized-for-controlled-delivery",
    revision: 1,
  };
  const decision = Object.freeze({
    ...partial,
    fingerprint: decisionFingerprint(partial),
  });
  assertAudiobookRetailReleaseDecision(decision);
  return decision;
}

export function audiobookRetailReleaseDecisionPublicView(
  decision: AudiobookRetailReleaseDecision,
): AudiobookRetailReleaseDecisionPublicView {
  assertAudiobookRetailReleaseDecision(decision);
  return Object.freeze({
    id: decision.id,
    bookId: decision.bookId,
    distributor: decision.distributor,
    policyVersion: decision.policy.externalVersion,
    narrationSourceKind: decision.narration.sourceKind,
    platformAuthorisationPresent:
      decision.narration.platformAuthorisationPresent,
    mediaFileCount: decision.package.mediaFileCount,
    totalPackageBytes: decision.package.totalPackageBytes,
    deliveryMethod: decision.deliveryMethod,
    maximumDeliveryAttempts: 1,
    decidedAt: decision.decidedAt,
    validUntil: decision.validUntil,
    status: decision.status,
    revision: 1,
    fingerprint: decision.fingerprint,
  });
}

function toEnvelope(
  envelope: StoredEnvelope<Record<string, unknown>>,
): StoredEnvelope<AudiobookRetailReleaseDecision> {
  const decision = envelope.payload as unknown as AudiobookRetailReleaseDecision;
  assertAudiobookRetailReleaseDecision(decision);
  if (
    envelope.entityType !== AUDIOBOOK_RETAIL_RELEASE_DECISION_ENTITY_TYPE
    || envelope.entityId !== decision.id
    || envelope.revision !== decision.revision
  ) {
    throw new AudiobookRetailReleaseDecisionStoreConflictError(
      "AUDIOBOOK_RETAIL_RELEASE_DECISION_STORE_ENVELOPE_SCOPE_MISMATCH",
    );
  }
  return envelope as unknown as StoredEnvelope<AudiobookRetailReleaseDecision>;
}

function payload(
  decision: AudiobookRetailReleaseDecision,
): Record<string, unknown> {
  return decision as unknown as Record<string, unknown>;
}

export class FileAudiobookRetailReleaseDecisionStore {
  readonly #store: FileProjectStore;

  constructor(store: FileProjectStore) {
    this.#store = store;
  }

  async create(
    decision: AudiobookRetailReleaseDecision,
    actorId: string,
  ): Promise<StoredEnvelope<AudiobookRetailReleaseDecision>> {
    assertAudiobookRetailReleaseDecision(decision);
    requireIdentifier(
      actorId,
      "AUDIOBOOK_RETAIL_RELEASE_DECISION_STORE_ACTOR_INVALID",
    );
    try {
      const existing = await this.read(decision.id);
      if (existing) {
        if (existing.payload.fingerprint === decision.fingerprint) return existing;
        throw new AudiobookRetailReleaseDecisionStoreConflictError(
          "AUDIOBOOK_RETAIL_RELEASE_DECISION_STORE_IDEMPOTENCY_CONFLICT",
        );
      }
      const envelope = toEnvelope(await this.#store.create(
        AUDIOBOOK_RETAIL_RELEASE_DECISION_ENTITY_TYPE,
        decision.id,
        payload(decision),
        new Date(decision.decidedAt),
      ));
      await this.#store.appendAuditEvent({
        actorId,
        action: "audiobook_retail_release_decision.created",
        entityType: AUDIOBOOK_RETAIL_RELEASE_DECISION_ENTITY_TYPE,
        entityId: envelope.entityId,
        revision: envelope.revision,
        occurredAt: new Date(envelope.savedAt),
        metadata: {
          status: decision.status,
          mediaFileCount: decision.package.mediaFileCount,
          totalPackageBytes: decision.package.totalPackageBytes,
          deliveryMethod: decision.deliveryMethod,
          maximumDeliveryAttempts: decision.maximumDeliveryAttempts,
          platformAuthorisationPresent:
            decision.narration.platformAuthorisationPresent,
        },
      });
      return envelope;
    } catch (error) {
      if (error instanceof StoreConflictError) {
        throw new AudiobookRetailReleaseDecisionStoreConflictError(error.message);
      }
      throw error;
    }
  }

  async read(
    decisionId: string,
  ): Promise<StoredEnvelope<AudiobookRetailReleaseDecision> | null> {
    requireIdentifier(
      decisionId,
      "AUDIOBOOK_RETAIL_RELEASE_DECISION_STORE_ID_INVALID",
    );
    const envelope = await this.#store.read<Record<string, unknown>>(
      AUDIOBOOK_RETAIL_RELEASE_DECISION_ENTITY_TYPE,
      decisionId,
    );
    return envelope ? toEnvelope(envelope) : null;
  }

  async require(
    decisionId: string,
  ): Promise<StoredEnvelope<AudiobookRetailReleaseDecision>> {
    const envelope = await this.read(decisionId);
    if (!envelope) {
      throw new AudiobookRetailReleaseDecisionStoreConflictError(
        "AUDIOBOOK_RETAIL_RELEASE_DECISION_STORE_NOT_FOUND",
      );
    }
    return envelope;
  }
}
