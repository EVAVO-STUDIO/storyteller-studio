import { stableHash } from "./index.js";
import {
  assertNarratorProfileAdmission,
  narratorProfileAdmissionPublicView,
  type AudioStudioNarratorProfileAdmission,
  type NarratorProfileAdmissionPublicView,
} from "./narrator-profile-admission.js";
import {
  approveNarratorCasting,
  assertExactNarratorVoicePin,
  assertNarratorCasting,
  pinNarratorVoiceProfile,
  type NarratorCastingApproval,
} from "./narrator-voice-profile.js";

export const STORYTELLER_ADMITTED_NARRATOR_CASTING_SCHEMA =
  "storyteller-admitted-narrator-casting-v1" as const;

export interface AdmittedNarratorCasting {
  schemaVersion: typeof STORYTELLER_ADMITTED_NARRATOR_CASTING_SCHEMA;
  projectId: string;
  profileAdmission: AudioStudioNarratorProfileAdmission;
  casting: NarratorCastingApproval;
  admissionVerified: true;
  castingApproved: true;
  exactRevisionRequired: true;
  chapterListeningApprovalRequired: true;
  defaultNarrator: false;
  titleReleaseAuthority: false;
  publicationAuthority: false;
  fingerprint: string;
}

export interface AdmittedNarratorCastingPublicView {
  projectId: string;
  profileId: string;
  profileRevision: number;
  engineKey: string;
  mode: NarratorProfileAdmissionPublicView["mode"];
  trainingProvenanceBound: boolean;
  admissionVerified: true;
  castingApproved: true;
  exactRevisionRequired: true;
  chapterListeningApprovalRequired: true;
  defaultNarrator: false;
  titleReleaseAuthority: false;
  publicationAuthority: false;
  profileAdmissionHash: string;
  admittedCastingFingerprint: string;
}

const HASH = /^[a-f0-9]{64}$/u;
const ADMITTED_CASTING_KEYS = new Set([
  "schemaVersion",
  "projectId",
  "profileAdmission",
  "casting",
  "admissionVerified",
  "castingApproved",
  "exactRevisionRequired",
  "chapterListeningApprovalRequired",
  "defaultNarrator",
  "titleReleaseAuthority",
  "publicationAuthority",
  "fingerprint",
]);

function requireObject(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(code);
  return value as Record<string, unknown>;
}

function requireExactKeys(
  value: Record<string, unknown>,
  expected: ReadonlySet<string>,
  code: string,
): void {
  const keys = Object.keys(value);
  if (keys.length !== expected.size || keys.some((key) => !expected.has(key))) {
    throw new Error(code);
  }
}

function admittedCastingBase(
  value: Omit<AdmittedNarratorCasting, "fingerprint">,
): Readonly<Record<string, unknown>> {
  return value;
}

export function approveAdmittedNarratorCasting(input: Readonly<{
  projectId: string;
  admission: AudioStudioNarratorProfileAdmission;
  approvedBy: string;
  approvedAt: string;
}>): AdmittedNarratorCasting {
  assertNarratorProfileAdmission(input.admission);
  const casting = approveNarratorCasting({
    projectId: input.projectId,
    profile: input.admission.profile,
    approvedBy: input.approvedBy,
    approvedAt: input.approvedAt,
  });
  const partial: Omit<AdmittedNarratorCasting, "fingerprint"> = {
    schemaVersion: STORYTELLER_ADMITTED_NARRATOR_CASTING_SCHEMA,
    projectId: casting.projectId,
    profileAdmission: input.admission,
    casting,
    admissionVerified: true,
    castingApproved: true,
    exactRevisionRequired: true,
    chapterListeningApprovalRequired: true,
    defaultNarrator: false,
    titleReleaseAuthority: false,
    publicationAuthority: false,
  };
  return Object.freeze({
    ...partial,
    fingerprint: stableHash(admittedCastingBase(partial)),
  });
}

export function assertAdmittedNarratorCasting(
  value: AdmittedNarratorCasting,
): void {
  const record = requireObject(value, "NARRATOR_CASTING_ADMISSION_REQUIRED");
  requireExactKeys(
    record,
    ADMITTED_CASTING_KEYS,
    "NARRATOR_CASTING_ADMISSION_SHAPE_INVALID",
  );
  if (value.schemaVersion !== STORYTELLER_ADMITTED_NARRATOR_CASTING_SCHEMA) {
    throw new Error("NARRATOR_CASTING_ADMISSION_SCHEMA_UNSUPPORTED");
  }
  assertNarratorProfileAdmission(value.profileAdmission);
  assertNarratorCasting(value.casting);
  if (value.projectId !== value.casting.projectId) {
    throw new Error("NARRATOR_CASTING_ADMISSION_PROJECT_MISMATCH");
  }
  const profile = value.profileAdmission.profile;
  assertExactNarratorVoicePin(
    pinNarratorVoiceProfile(profile),
    value.casting.voice,
  );
  if (profile.voiceIdentityId !== value.casting.voiceIdentityId) {
    throw new Error("NARRATOR_CASTING_ADMISSION_VOICE_IDENTITY_MISMATCH");
  }
  if (value.profileAdmission.engineKey !== value.casting.engineKey) {
    throw new Error("NARRATOR_CASTING_ADMISSION_ENGINE_MISMATCH");
  }
  if (value.profileAdmission.mode !== value.casting.mode) {
    throw new Error("NARRATOR_CASTING_ADMISSION_MODE_MISMATCH");
  }
  if (
    value.profileAdmission.modelArtifactTreeSha256
    !== value.casting.modelArtifactTreeSha256
  ) throw new Error("NARRATOR_CASTING_ADMISSION_MODEL_MISMATCH");
  if (
    profile.rights.sourceRightsFingerprint
    !== value.casting.sourceRightsFingerprint
  ) throw new Error("NARRATOR_CASTING_ADMISSION_RIGHTS_MISMATCH");
  if (profile.evidenceHash !== value.casting.evidenceHash) {
    throw new Error("NARRATOR_CASTING_ADMISSION_EVIDENCE_MISMATCH");
  }
  if (
    value.admissionVerified !== true
    || value.castingApproved !== true
    || value.exactRevisionRequired !== true
    || value.chapterListeningApprovalRequired !== true
    || value.defaultNarrator !== false
    || value.titleReleaseAuthority !== false
    || value.publicationAuthority !== false
  ) throw new Error("NARRATOR_CASTING_ADMISSION_AUTHORITY_INVALID");
  const { fingerprint, ...partial } = value;
  if (!HASH.test(fingerprint) || fingerprint !== stableHash(admittedCastingBase(partial))) {
    throw new Error("NARRATOR_CASTING_ADMISSION_FINGERPRINT_INVALID");
  }
}

export function narratorCastingFromAdmission(
  value: AdmittedNarratorCasting,
): NarratorCastingApproval {
  assertAdmittedNarratorCasting(value);
  return value.casting;
}

export function admittedNarratorCastingPublicView(
  value: AdmittedNarratorCasting,
): AdmittedNarratorCastingPublicView {
  assertAdmittedNarratorCasting(value);
  const admission = narratorProfileAdmissionPublicView(value.profileAdmission);
  return Object.freeze({
    projectId: value.projectId,
    profileId: admission.profileId,
    profileRevision: admission.profileRevision,
    engineKey: admission.engineKey,
    mode: admission.mode,
    trainingProvenanceBound: admission.trainingProvenanceBound,
    admissionVerified: true,
    castingApproved: true,
    exactRevisionRequired: true,
    chapterListeningApprovalRequired: true,
    defaultNarrator: false,
    titleReleaseAuthority: false,
    publicationAuthority: false,
    profileAdmissionHash: admission.admissionHash,
    admittedCastingFingerprint: value.fingerprint,
  });
}
