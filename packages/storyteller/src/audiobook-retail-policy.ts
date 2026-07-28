import { stableHash } from "./index.js";

export const AUDIOBOOK_RETAIL_POLICY_SCHEMA_VERSION =
  "storyteller-audiobook-retail-policy-v1" as const;
export const AUDIOBOOK_RETAIL_PLATFORM_AUTHORISATION_SCHEMA_VERSION =
  "storyteller-audiobook-retail-platform-authorisation-v1" as const;
export const AUDIOBOOK_RETAIL_NARRATION_EVIDENCE_SCHEMA_VERSION =
  "storyteller-audiobook-retail-narration-evidence-v1" as const;

export type AudiobookRetailDistributor = "acx-audible";
export type AudiobookRetailBitRateKbps = 192 | 256 | 320;
export type AudiobookRetailNarrationSourceKind =
  | "human-performance"
  | "synthetic-voice"
  | "mixed-performance";
export type AudiobookRetailAuthorisationType =
  | "title-specific"
  | "publisher-program";

export interface AudiobookRetailOutputPolicy {
  format: "mp3";
  codec: "mp3";
  bitRateMode: "cbr";
  bitRateKbps: AudiobookRetailBitRateKbps;
  sampleRateHz: 44_100;
  channelPolicy: "book-consistent-mono-or-stereo";
}

export interface AudiobookRetailTrackPolicy {
  oneSectionPerFile: true;
  openingCreditSeparate: true;
  closingCreditSeparate: true;
  sectionHeaderRequired: true;
  maximumFileDurationMs: 7_200_000;
  splitSectionRequiresSecondaryHeader: true;
  standardUsAlphanumericFileNames: true;
  consistentChannelFormat: true;
}

export interface AudiobookRetailAcousticPolicy {
  rmsDb: Readonly<{
    minimumInclusive: -23;
    maximumInclusive: -18;
  }>;
  peakDb: Readonly<{
    comparator: "less-than";
    threshold: -3;
  }>;
  noiseFloorDbRms: Readonly<{
    comparator: "less-than";
    threshold: -60;
  }>;
  roomToneMs: Readonly<{
    minimumRecommended: 1_000;
    maximumAllowed: 5_000;
  }>;
  soundAndFormattingConsistencyRequired: true;
  extraneousSoundsProhibited: true;
}

export interface AudiobookRetailSamplePolicy {
  maximumDurationMs: 300_000;
  mustComeFromAudiobook: true;
  explicitContentProhibited: true;
  humanContentSafetyReviewRequired: true;
  preferredSource: "book-beginning";
}

export interface AudiobookRetailNarrationPolicy {
  mode: "human-unless-platform-authorised";
  humanPerformanceAllowed: true;
  syntheticVoiceRequiresPlatformAuthorisation: true;
  mixedPerformanceRequiresPlatformAuthorisation: true;
  voiceConsentIsNotPlatformAuthorisation: true;
}

export interface AudiobookRetailEncodingPolicy {
  schemaVersion: typeof AUDIOBOOK_RETAIL_POLICY_SCHEMA_VERSION;
  id: string;
  distributor: AudiobookRetailDistributor;
  externalVersion: string;
  reviewedAt: string;
  expiresAt: string;
  sourceReference: string;
  output: AudiobookRetailOutputPolicy;
  track: AudiobookRetailTrackPolicy;
  acoustic: AudiobookRetailAcousticPolicy;
  sample: AudiobookRetailSamplePolicy;
  narration: AudiobookRetailNarrationPolicy;
  fingerprint: string;
}

export interface AudiobookRetailEncodingPolicyPublicView {
  id: string;
  distributor: AudiobookRetailDistributor;
  externalVersion: string;
  reviewedAt: string;
  expiresAt: string;
  current: boolean;
  output: AudiobookRetailOutputPolicy;
  maximumFileDurationMs: number;
  oneSectionPerFile: true;
  separateCredits: true;
  rmsDbRange: readonly [-23, -18];
  peakThresholdDb: -3;
  noiseFloorThresholdDbRms: -60;
  roomToneRangeMs: readonly [1_000, 5_000];
  maximumSampleDurationMs: 300_000;
  narrationMode: AudiobookRetailNarrationPolicy["mode"];
  fingerprint: string;
}

export interface AudiobookRetailPlatformAuthorisation {
  schemaVersion:
    typeof AUDIOBOOK_RETAIL_PLATFORM_AUTHORISATION_SCHEMA_VERSION;
  id: string;
  authority: "audible-or-acx";
  distributor: AudiobookRetailDistributor;
  authorisationType: AudiobookRetailAuthorisationType;
  projectId: string;
  bookId: string;
  policyFingerprint: string;
  permittedUse: "acx-retail-audiobook";
  authorisationEvidenceId: string;
  effectiveAt: string;
  expiresAt: string;
  fingerprint: string;
}

export interface AudiobookRetailNarrationEligibilityEvidence {
  schemaVersion:
    typeof AUDIOBOOK_RETAIL_NARRATION_EVIDENCE_SCHEMA_VERSION;
  id: string;
  projectId: string;
  bookId: string;
  distributor: AudiobookRetailDistributor;
  policyFingerprint: string;
  sourceKind: AudiobookRetailNarrationSourceKind;
  rightsFingerprint: string;
  attestedByActorId: string;
  attestedAt: string;
  platformAuthorisation?: AudiobookRetailPlatformAuthorisation;
  status: "eligible";
  fingerprint: string;
}

export interface AudiobookRetailNarrationEligibilityPublicView {
  id: string;
  distributor: AudiobookRetailDistributor;
  sourceKind: AudiobookRetailNarrationSourceKind;
  status: "eligible";
  platformAuthorisationRequired: boolean;
  platformAuthorisationPresent: boolean;
  platformAuthorisationExpiresAt?: string;
  attestedAt: string;
  fingerprint: string;
}

export class AudiobookRetailPolicyError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "AudiobookRetailPolicyError";
    this.code = code;
  }
}

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;
const SAFE_VERSION = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;
const HUMAN_BLOCKLIST = /^(?:system|worker|automation|automated|bot)(?:[_-]|$)/iu;
const MAX_SOURCE_REFERENCE_LENGTH = 500;
const MAX_POLICY_LIFETIME_MS = 366 * 24 * 60 * 60 * 1_000;

const ACX_TRACK_POLICY: AudiobookRetailTrackPolicy = Object.freeze({
  oneSectionPerFile: true,
  openingCreditSeparate: true,
  closingCreditSeparate: true,
  sectionHeaderRequired: true,
  maximumFileDurationMs: 120 * 60 * 1_000,
  splitSectionRequiresSecondaryHeader: true,
  standardUsAlphanumericFileNames: true,
  consistentChannelFormat: true,
});

const ACX_ACOUSTIC_POLICY: AudiobookRetailAcousticPolicy = Object.freeze({
  rmsDb: Object.freeze({
    minimumInclusive: -23,
    maximumInclusive: -18,
  }),
  peakDb: Object.freeze({
    comparator: "less-than",
    threshold: -3,
  }),
  noiseFloorDbRms: Object.freeze({
    comparator: "less-than",
    threshold: -60,
  }),
  roomToneMs: Object.freeze({
    minimumRecommended: 1_000,
    maximumAllowed: 5_000,
  }),
  soundAndFormattingConsistencyRequired: true,
  extraneousSoundsProhibited: true,
});

const ACX_SAMPLE_POLICY: AudiobookRetailSamplePolicy = Object.freeze({
  maximumDurationMs: 5 * 60 * 1_000,
  mustComeFromAudiobook: true,
  explicitContentProhibited: true,
  humanContentSafetyReviewRequired: true,
  preferredSource: "book-beginning",
});

const ACX_NARRATION_POLICY: AudiobookRetailNarrationPolicy = Object.freeze({
  mode: "human-unless-platform-authorised",
  humanPerformanceAllowed: true,
  syntheticVoiceRequiresPlatformAuthorisation: true,
  mixedPerformanceRequiresPlatformAuthorisation: true,
  voiceConsentIsNotPlatformAuthorisation: true,
});

function requireIdentifier(value: string, code: string): string {
  if (!SAFE_IDENTIFIER.test(value)) {
    throw new AudiobookRetailPolicyError(code);
  }
  return value;
}

function requireVersion(value: string, code: string): string {
  if (!SAFE_VERSION.test(value)) {
    throw new AudiobookRetailPolicyError(code);
  }
  return value;
}

function requireHash(value: string, code: string): string {
  if (!HASH_PATTERN.test(value)) {
    throw new AudiobookRetailPolicyError(code);
  }
  return value;
}

function requireDate(value: string, code: string): string {
  if (!value || Number.isNaN(Date.parse(value))) {
    throw new AudiobookRetailPolicyError(code);
  }
  return value;
}

function requireHumanActor(value: string, code: string): string {
  requireIdentifier(value, code);
  if (HUMAN_BLOCKLIST.test(value)) {
    throw new AudiobookRetailPolicyError(code);
  }
  return value;
}

function requireSourceReference(value: string): string {
  const trimmed = value.trim();
  if (
    !trimmed
    || trimmed.length > MAX_SOURCE_REFERENCE_LENGTH
    || CONTROL_CHARACTERS.test(trimmed)
  ) {
    throw new AudiobookRetailPolicyError(
      "AUDIOBOOK_RETAIL_POLICY_SOURCE_REFERENCE_INVALID",
    );
  }
  return trimmed;
}

function requireChronology(input: Readonly<{
  reviewedAt: string;
  expiresAt: string;
  now?: Date;
}>): void {
  const reviewedAt = Date.parse(requireDate(
    input.reviewedAt,
    "AUDIOBOOK_RETAIL_POLICY_REVIEW_DATE_INVALID",
  ));
  const expiresAt = Date.parse(requireDate(
    input.expiresAt,
    "AUDIOBOOK_RETAIL_POLICY_EXPIRY_DATE_INVALID",
  ));
  if (
    expiresAt <= reviewedAt
    || expiresAt - reviewedAt > MAX_POLICY_LIFETIME_MS
  ) {
    throw new AudiobookRetailPolicyError(
      "AUDIOBOOK_RETAIL_POLICY_LIFETIME_INVALID",
    );
  }
  if (input.now) {
    if (
      Number.isNaN(input.now.getTime())
      || reviewedAt > input.now.getTime()
      || expiresAt <= input.now.getTime()
    ) {
      throw new AudiobookRetailPolicyError(
        "AUDIOBOOK_RETAIL_POLICY_NOT_CURRENT",
      );
    }
  }
}

function outputPolicy(
  bitRateKbps: AudiobookRetailBitRateKbps,
): AudiobookRetailOutputPolicy {
  if (![192, 256, 320].includes(bitRateKbps)) {
    throw new AudiobookRetailPolicyError(
      "AUDIOBOOK_RETAIL_POLICY_BIT_RATE_UNSUPPORTED",
    );
  }
  return Object.freeze({
    format: "mp3",
    codec: "mp3",
    bitRateMode: "cbr",
    bitRateKbps,
    sampleRateHz: 44_100,
    channelPolicy: "book-consistent-mono-or-stereo",
  });
}

function policyFingerprint(
  value: Omit<AudiobookRetailEncodingPolicy, "fingerprint">,
): string {
  return stableHash(value);
}

function authorisationFingerprint(
  value: Omit<AudiobookRetailPlatformAuthorisation, "fingerprint">,
): string {
  return stableHash(value);
}

function narrationEvidenceFingerprint(
  value: Omit<AudiobookRetailNarrationEligibilityEvidence, "fingerprint">,
): string {
  return stableHash(value);
}

function requiresPlatformAuthorisation(
  sourceKind: AudiobookRetailNarrationSourceKind,
): boolean {
  return sourceKind !== "human-performance";
}

function assertCanonicalPolicyShape(
  policy: AudiobookRetailEncodingPolicy,
): void {
  const expectedOutput = outputPolicy(policy.output.bitRateKbps);
  if (
    stableHash(policy.output) !== stableHash(expectedOutput)
    || stableHash(policy.track) !== stableHash(ACX_TRACK_POLICY)
    || stableHash(policy.acoustic) !== stableHash(ACX_ACOUSTIC_POLICY)
    || stableHash(policy.sample) !== stableHash(ACX_SAMPLE_POLICY)
    || stableHash(policy.narration) !== stableHash(ACX_NARRATION_POLICY)
  ) {
    throw new AudiobookRetailPolicyError(
      "AUDIOBOOK_RETAIL_POLICY_REQUIREMENTS_INVALID",
    );
  }
}

export function createAcxAudibleRetailEncodingPolicy(input: Readonly<{
  id?: string;
  externalVersion: string;
  reviewedAt: string;
  expiresAt: string;
  sourceReference: string;
  bitRateKbps?: AudiobookRetailBitRateKbps;
  now?: Date;
}>): AudiobookRetailEncodingPolicy {
  requireChronology({
    reviewedAt: input.reviewedAt,
    expiresAt: input.expiresAt,
    ...(input.now ? { now: input.now } : {}),
  });
  const externalVersion = requireVersion(
    input.externalVersion,
    "AUDIOBOOK_RETAIL_POLICY_EXTERNAL_VERSION_INVALID",
  );
  const sourceReference = requireSourceReference(input.sourceReference);
  const output = outputPolicy(input.bitRateKbps ?? 192);
  const derivedId = `retail_policy_acx_${stableHash({
    externalVersion,
    reviewedAt: input.reviewedAt,
    output,
  }).slice(0, 24)}`;
  const partial: Omit<AudiobookRetailEncodingPolicy, "fingerprint"> = {
    schemaVersion: AUDIOBOOK_RETAIL_POLICY_SCHEMA_VERSION,
    id: requireIdentifier(
      input.id ?? derivedId,
      "AUDIOBOOK_RETAIL_POLICY_ID_INVALID",
    ),
    distributor: "acx-audible",
    externalVersion,
    reviewedAt: input.reviewedAt,
    expiresAt: input.expiresAt,
    sourceReference,
    output,
    track: ACX_TRACK_POLICY,
    acoustic: ACX_ACOUSTIC_POLICY,
    sample: ACX_SAMPLE_POLICY,
    narration: ACX_NARRATION_POLICY,
  };
  const policy = Object.freeze({
    ...partial,
    fingerprint: policyFingerprint(partial),
  });
  assertAudiobookRetailEncodingPolicy(policy);
  return policy;
}

export function assertAudiobookRetailEncodingPolicy(
  policy: AudiobookRetailEncodingPolicy,
): void {
  if (policy.schemaVersion !== AUDIOBOOK_RETAIL_POLICY_SCHEMA_VERSION) {
    throw new AudiobookRetailPolicyError(
      "AUDIOBOOK_RETAIL_POLICY_SCHEMA_UNSUPPORTED",
    );
  }
  requireIdentifier(policy.id, "AUDIOBOOK_RETAIL_POLICY_ID_INVALID");
  if (policy.distributor !== "acx-audible") {
    throw new AudiobookRetailPolicyError(
      "AUDIOBOOK_RETAIL_POLICY_DISTRIBUTOR_UNSUPPORTED",
    );
  }
  requireVersion(
    policy.externalVersion,
    "AUDIOBOOK_RETAIL_POLICY_EXTERNAL_VERSION_INVALID",
  );
  requireChronology({
    reviewedAt: policy.reviewedAt,
    expiresAt: policy.expiresAt,
  });
  requireSourceReference(policy.sourceReference);
  assertCanonicalPolicyShape(policy);
  const { fingerprint, ...partial } = policy;
  if (policyFingerprint(partial) !== fingerprint) {
    throw new AudiobookRetailPolicyError(
      "AUDIOBOOK_RETAIL_POLICY_FINGERPRINT_INVALID",
    );
  }
}

export function assertCurrentAudiobookRetailEncodingPolicy(
  policy: AudiobookRetailEncodingPolicy,
  now = new Date(),
): void {
  assertAudiobookRetailEncodingPolicy(policy);
  requireChronology({
    reviewedAt: policy.reviewedAt,
    expiresAt: policy.expiresAt,
    now,
  });
}

export function audiobookRetailEncodingPolicyPublicView(
  policy: AudiobookRetailEncodingPolicy,
  now = new Date(),
): AudiobookRetailEncodingPolicyPublicView {
  assertAudiobookRetailEncodingPolicy(policy);
  const instant = now.getTime();
  if (Number.isNaN(instant)) {
    throw new AudiobookRetailPolicyError(
      "AUDIOBOOK_RETAIL_POLICY_VIEW_DATE_INVALID",
    );
  }
  return Object.freeze({
    id: policy.id,
    distributor: policy.distributor,
    externalVersion: policy.externalVersion,
    reviewedAt: policy.reviewedAt,
    expiresAt: policy.expiresAt,
    current:
      Date.parse(policy.reviewedAt) <= instant
      && Date.parse(policy.expiresAt) > instant,
    output: policy.output,
    maximumFileDurationMs: policy.track.maximumFileDurationMs,
    oneSectionPerFile: true,
    separateCredits: true,
    rmsDbRange: Object.freeze([-23, -18] as const),
    peakThresholdDb: -3,
    noiseFloorThresholdDbRms: -60,
    roomToneRangeMs: Object.freeze([1_000, 5_000] as const),
    maximumSampleDurationMs: 300_000,
    narrationMode: policy.narration.mode,
    fingerprint: policy.fingerprint,
  });
}

export function createAudiobookRetailPlatformAuthorisation(input: Readonly<{
  id: string;
  authorisationType: AudiobookRetailAuthorisationType;
  projectId: string;
  bookId: string;
  policy: AudiobookRetailEncodingPolicy;
  authorisationEvidenceId: string;
  effectiveAt: string;
  expiresAt: string;
  now?: Date;
}>): AudiobookRetailPlatformAuthorisation {
  const now = input.now ?? new Date();
  assertCurrentAudiobookRetailEncodingPolicy(input.policy, now);
  if (
    input.authorisationType !== "title-specific"
    && input.authorisationType !== "publisher-program"
  ) {
    throw new AudiobookRetailPolicyError(
      "AUDIOBOOK_RETAIL_AUTHORISATION_TYPE_INVALID",
    );
  }
  const effectiveAt = Date.parse(requireDate(
    input.effectiveAt,
    "AUDIOBOOK_RETAIL_AUTHORISATION_EFFECTIVE_DATE_INVALID",
  ));
  const expiresAt = Date.parse(requireDate(
    input.expiresAt,
    "AUDIOBOOK_RETAIL_AUTHORISATION_EXPIRY_DATE_INVALID",
  ));
  if (
    effectiveAt > now.getTime()
    || expiresAt <= now.getTime()
    || expiresAt <= effectiveAt
  ) {
    throw new AudiobookRetailPolicyError(
      "AUDIOBOOK_RETAIL_AUTHORISATION_NOT_CURRENT",
    );
  }
  const partial: Omit<
    AudiobookRetailPlatformAuthorisation,
    "fingerprint"
  > = {
    schemaVersion:
      AUDIOBOOK_RETAIL_PLATFORM_AUTHORISATION_SCHEMA_VERSION,
    id: requireIdentifier(
      input.id,
      "AUDIOBOOK_RETAIL_AUTHORISATION_ID_INVALID",
    ),
    authority: "audible-or-acx",
    distributor: "acx-audible",
    authorisationType: input.authorisationType,
    projectId: requireIdentifier(
      input.projectId,
      "AUDIOBOOK_RETAIL_AUTHORISATION_PROJECT_ID_INVALID",
    ),
    bookId: requireIdentifier(
      input.bookId,
      "AUDIOBOOK_RETAIL_AUTHORISATION_BOOK_ID_INVALID",
    ),
    policyFingerprint: input.policy.fingerprint,
    permittedUse: "acx-retail-audiobook",
    authorisationEvidenceId: requireIdentifier(
      input.authorisationEvidenceId,
      "AUDIOBOOK_RETAIL_AUTHORISATION_EVIDENCE_ID_INVALID",
    ),
    effectiveAt: input.effectiveAt,
    expiresAt: input.expiresAt,
  };
  const authorisation = Object.freeze({
    ...partial,
    fingerprint: authorisationFingerprint(partial),
  });
  assertAudiobookRetailPlatformAuthorisation(
    authorisation,
    input.policy,
    now,
  );
  return authorisation;
}

export function assertAudiobookRetailPlatformAuthorisation(
  authorisation: AudiobookRetailPlatformAuthorisation,
  policy: AudiobookRetailEncodingPolicy,
  now = new Date(),
): void {
  assertCurrentAudiobookRetailEncodingPolicy(policy, now);
  if (
    authorisation.schemaVersion
      !== AUDIOBOOK_RETAIL_PLATFORM_AUTHORISATION_SCHEMA_VERSION
  ) {
    throw new AudiobookRetailPolicyError(
      "AUDIOBOOK_RETAIL_AUTHORISATION_SCHEMA_UNSUPPORTED",
    );
  }
  requireIdentifier(
    authorisation.id,
    "AUDIOBOOK_RETAIL_AUTHORISATION_ID_INVALID",
  );
  if (
    authorisation.authority !== "audible-or-acx"
    || authorisation.distributor !== policy.distributor
    || authorisation.permittedUse !== "acx-retail-audiobook"
  ) {
    throw new AudiobookRetailPolicyError(
      "AUDIOBOOK_RETAIL_AUTHORISATION_SCOPE_INVALID",
    );
  }
  if (
    authorisation.authorisationType !== "title-specific"
    && authorisation.authorisationType !== "publisher-program"
  ) {
    throw new AudiobookRetailPolicyError(
      "AUDIOBOOK_RETAIL_AUTHORISATION_TYPE_INVALID",
    );
  }
  requireIdentifier(
    authorisation.projectId,
    "AUDIOBOOK_RETAIL_AUTHORISATION_PROJECT_ID_INVALID",
  );
  requireIdentifier(
    authorisation.bookId,
    "AUDIOBOOK_RETAIL_AUTHORISATION_BOOK_ID_INVALID",
  );
  requireHash(
    authorisation.policyFingerprint,
    "AUDIOBOOK_RETAIL_AUTHORISATION_POLICY_HASH_INVALID",
  );
  if (authorisation.policyFingerprint !== policy.fingerprint) {
    throw new AudiobookRetailPolicyError(
      "AUDIOBOOK_RETAIL_AUTHORISATION_POLICY_MISMATCH",
    );
  }
  requireIdentifier(
    authorisation.authorisationEvidenceId,
    "AUDIOBOOK_RETAIL_AUTHORISATION_EVIDENCE_ID_INVALID",
  );
  const effectiveAt = Date.parse(requireDate(
    authorisation.effectiveAt,
    "AUDIOBOOK_RETAIL_AUTHORISATION_EFFECTIVE_DATE_INVALID",
  ));
  const expiresAt = Date.parse(requireDate(
    authorisation.expiresAt,
    "AUDIOBOOK_RETAIL_AUTHORISATION_EXPIRY_DATE_INVALID",
  ));
  if (
    Number.isNaN(now.getTime())
    || effectiveAt > now.getTime()
    || expiresAt <= now.getTime()
    || expiresAt <= effectiveAt
  ) {
    throw new AudiobookRetailPolicyError(
      "AUDIOBOOK_RETAIL_AUTHORISATION_NOT_CURRENT",
    );
  }
  const { fingerprint, ...partial } = authorisation;
  if (authorisationFingerprint(partial) !== fingerprint) {
    throw new AudiobookRetailPolicyError(
      "AUDIOBOOK_RETAIL_AUTHORISATION_FINGERPRINT_INVALID",
    );
  }
}

export function createAudiobookRetailNarrationEligibilityEvidence(
  input: Readonly<{
    id: string;
    projectId: string;
    bookId: string;
    policy: AudiobookRetailEncodingPolicy;
    sourceKind: AudiobookRetailNarrationSourceKind;
    rightsFingerprint: string;
    attestedByActorId: string;
    attestedAt: string;
    platformAuthorisation?: AudiobookRetailPlatformAuthorisation;
    now?: Date;
  }>,
): AudiobookRetailNarrationEligibilityEvidence {
  const now = input.now ?? new Date();
  assertCurrentAudiobookRetailEncodingPolicy(input.policy, now);
  if (
    input.sourceKind !== "human-performance"
    && input.sourceKind !== "synthetic-voice"
    && input.sourceKind !== "mixed-performance"
  ) {
    throw new AudiobookRetailPolicyError(
      "AUDIOBOOK_RETAIL_NARRATION_SOURCE_KIND_INVALID",
    );
  }
  const attestedAt = Date.parse(requireDate(
    input.attestedAt,
    "AUDIOBOOK_RETAIL_NARRATION_ATTESTATION_DATE_INVALID",
  ));
  if (
    attestedAt > now.getTime()
    || attestedAt < Date.parse(input.policy.reviewedAt)
  ) {
    throw new AudiobookRetailPolicyError(
      "AUDIOBOOK_RETAIL_NARRATION_ATTESTATION_DATE_INVALID",
    );
  }
  const projectId = requireIdentifier(
    input.projectId,
    "AUDIOBOOK_RETAIL_NARRATION_PROJECT_ID_INVALID",
  );
  const bookId = requireIdentifier(
    input.bookId,
    "AUDIOBOOK_RETAIL_NARRATION_BOOK_ID_INVALID",
  );
  const required = requiresPlatformAuthorisation(input.sourceKind);
  if (!required && input.platformAuthorisation) {
    throw new AudiobookRetailPolicyError(
      "AUDIOBOOK_RETAIL_NARRATION_AUTHORISATION_UNEXPECTED",
    );
  }
  if (required && !input.platformAuthorisation) {
    throw new AudiobookRetailPolicyError(
      "AUDIOBOOK_RETAIL_NARRATION_PLATFORM_AUTHORISATION_REQUIRED",
    );
  }
  if (input.platformAuthorisation) {
    assertAudiobookRetailPlatformAuthorisation(
      input.platformAuthorisation,
      input.policy,
      now,
    );
    if (
      input.platformAuthorisation.projectId !== projectId
      || input.platformAuthorisation.bookId !== bookId
    ) {
      throw new AudiobookRetailPolicyError(
        "AUDIOBOOK_RETAIL_NARRATION_AUTHORISATION_SCOPE_MISMATCH",
      );
    }
  }
  const partial: Omit<
    AudiobookRetailNarrationEligibilityEvidence,
    "fingerprint"
  > = {
    schemaVersion:
      AUDIOBOOK_RETAIL_NARRATION_EVIDENCE_SCHEMA_VERSION,
    id: requireIdentifier(
      input.id,
      "AUDIOBOOK_RETAIL_NARRATION_EVIDENCE_ID_INVALID",
    ),
    projectId,
    bookId,
    distributor: input.policy.distributor,
    policyFingerprint: input.policy.fingerprint,
    sourceKind: input.sourceKind,
    rightsFingerprint: requireHash(
      input.rightsFingerprint,
      "AUDIOBOOK_RETAIL_NARRATION_RIGHTS_HASH_INVALID",
    ),
    attestedByActorId: requireHumanActor(
      input.attestedByActorId,
      "AUDIOBOOK_RETAIL_NARRATION_ATTESTOR_INVALID",
    ),
    attestedAt: input.attestedAt,
    ...(input.platformAuthorisation
      ? { platformAuthorisation: input.platformAuthorisation }
      : {}),
    status: "eligible",
  };
  const evidence = Object.freeze({
    ...partial,
    fingerprint: narrationEvidenceFingerprint(partial),
  });
  assertAudiobookRetailNarrationEligibilityEvidence(
    evidence,
    input.policy,
    now,
  );
  return evidence;
}

export function assertAudiobookRetailNarrationEligibilityEvidence(
  evidence: AudiobookRetailNarrationEligibilityEvidence,
  policy: AudiobookRetailEncodingPolicy,
  now = new Date(),
): void {
  assertCurrentAudiobookRetailEncodingPolicy(policy, now);
  if (
    evidence.schemaVersion
      !== AUDIOBOOK_RETAIL_NARRATION_EVIDENCE_SCHEMA_VERSION
  ) {
    throw new AudiobookRetailPolicyError(
      "AUDIOBOOK_RETAIL_NARRATION_EVIDENCE_SCHEMA_UNSUPPORTED",
    );
  }
  requireIdentifier(
    evidence.id,
    "AUDIOBOOK_RETAIL_NARRATION_EVIDENCE_ID_INVALID",
  );
  requireIdentifier(
    evidence.projectId,
    "AUDIOBOOK_RETAIL_NARRATION_PROJECT_ID_INVALID",
  );
  requireIdentifier(
    evidence.bookId,
    "AUDIOBOOK_RETAIL_NARRATION_BOOK_ID_INVALID",
  );
  if (
    evidence.distributor !== policy.distributor
    || evidence.policyFingerprint !== policy.fingerprint
  ) {
    throw new AudiobookRetailPolicyError(
      "AUDIOBOOK_RETAIL_NARRATION_POLICY_MISMATCH",
    );
  }
  requireHash(
    evidence.policyFingerprint,
    "AUDIOBOOK_RETAIL_NARRATION_POLICY_HASH_INVALID",
  );
  if (
    evidence.sourceKind !== "human-performance"
    && evidence.sourceKind !== "synthetic-voice"
    && evidence.sourceKind !== "mixed-performance"
  ) {
    throw new AudiobookRetailPolicyError(
      "AUDIOBOOK_RETAIL_NARRATION_SOURCE_KIND_INVALID",
    );
  }
  requireHash(
    evidence.rightsFingerprint,
    "AUDIOBOOK_RETAIL_NARRATION_RIGHTS_HASH_INVALID",
  );
  requireHumanActor(
    evidence.attestedByActorId,
    "AUDIOBOOK_RETAIL_NARRATION_ATTESTOR_INVALID",
  );
  const attestedAt = Date.parse(requireDate(
    evidence.attestedAt,
    "AUDIOBOOK_RETAIL_NARRATION_ATTESTATION_DATE_INVALID",
  ));
  if (
    Number.isNaN(now.getTime())
    || attestedAt > now.getTime()
    || attestedAt < Date.parse(policy.reviewedAt)
  ) {
    throw new AudiobookRetailPolicyError(
      "AUDIOBOOK_RETAIL_NARRATION_ATTESTATION_DATE_INVALID",
    );
  }
  const required = requiresPlatformAuthorisation(evidence.sourceKind);
  if (!required && evidence.platformAuthorisation) {
    throw new AudiobookRetailPolicyError(
      "AUDIOBOOK_RETAIL_NARRATION_AUTHORISATION_UNEXPECTED",
    );
  }
  if (required && !evidence.platformAuthorisation) {
    throw new AudiobookRetailPolicyError(
      "AUDIOBOOK_RETAIL_NARRATION_PLATFORM_AUTHORISATION_REQUIRED",
    );
  }
  if (evidence.platformAuthorisation) {
    assertAudiobookRetailPlatformAuthorisation(
      evidence.platformAuthorisation,
      policy,
      now,
    );
    if (
      evidence.platformAuthorisation.projectId !== evidence.projectId
      || evidence.platformAuthorisation.bookId !== evidence.bookId
    ) {
      throw new AudiobookRetailPolicyError(
        "AUDIOBOOK_RETAIL_NARRATION_AUTHORISATION_SCOPE_MISMATCH",
      );
    }
  }
  if (evidence.status !== "eligible") {
    throw new AudiobookRetailPolicyError(
      "AUDIOBOOK_RETAIL_NARRATION_STATUS_INVALID",
    );
  }
  const { fingerprint, ...partial } = evidence;
  if (narrationEvidenceFingerprint(partial) !== fingerprint) {
    throw new AudiobookRetailPolicyError(
      "AUDIOBOOK_RETAIL_NARRATION_FINGERPRINT_INVALID",
    );
  }
}

export function audiobookRetailNarrationEligibilityPublicView(
  evidence: AudiobookRetailNarrationEligibilityEvidence,
  policy: AudiobookRetailEncodingPolicy,
  now = new Date(),
): AudiobookRetailNarrationEligibilityPublicView {
  assertAudiobookRetailNarrationEligibilityEvidence(evidence, policy, now);
  const required = requiresPlatformAuthorisation(evidence.sourceKind);
  return Object.freeze({
    id: evidence.id,
    distributor: evidence.distributor,
    sourceKind: evidence.sourceKind,
    status: evidence.status,
    platformAuthorisationRequired: required,
    platformAuthorisationPresent:
      evidence.platformAuthorisation !== undefined,
    ...(evidence.platformAuthorisation
      ? { platformAuthorisationExpiresAt:
          evidence.platformAuthorisation.expiresAt }
      : {}),
    attestedAt: evidence.attestedAt,
    fingerprint: evidence.fingerprint,
  });
}
