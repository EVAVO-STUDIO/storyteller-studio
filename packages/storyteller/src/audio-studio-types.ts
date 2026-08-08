import type { VoiceSourceKind } from "./index.js";
import type {
  ProviderCapabilitySnapshot,
  SynthesisRequest,
} from "./provider-adapter.js";

export const AUDIO_STUDIO_PROVIDER_ID = "evavo-audio-studio";
export const AUDIO_STUDIO_ADAPTER_VERSION = "1.0.0";
export const AUDIO_STUDIO_RENDER_SCHEMA = "evavo_voice_render_request_v1";
export const AUDIO_STUDIO_RIGHTS_SCHEMA = "evavo_voice_rights_record_v1";

export type AudioStudioRightsBasis =
  | "unknown"
  | "owned"
  | "licensed"
  | "commissioned"
  | "public_domain"
  | "not_applicable";

export type AudioStudioConsentBasis =
  | "unknown"
  | "none"
  | "self"
  | "written_consent"
  | "contract"
  | "not_applicable";

export type AudioStudioVoiceOperation =
  | "inspect"
  | "hash"
  | "transcode_for_analysis"
  | "transcribe_for_analysis"
  | "diarize_for_analysis"
  | "segment_for_analysis"
  | "create_voice_reference"
  | "train_voice_model"
  | "fine_tune_voice_model"
  | "synthesise"
  | "commercial_use"
  | "public_distribution";

export interface AudioStudioVoiceRightsRecord {
  schema: typeof AUDIO_STUDIO_RIGHTS_SCHEMA;
  sourceSha256: string;
  sourceTitle: string;
  textRightsBasis: AudioStudioRightsBasis;
  recordingRightsBasis: AudioStudioRightsBasis;
  performerIdentity?: string;
  performerConsentBasis: AudioStudioConsentBasis;
  operations: readonly AudioStudioVoiceOperation[];
  evidenceRefs: readonly string[];
  commercialUseAuthorized: boolean;
  publicDistributionAuthorized: boolean;
  effectiveFrom?: string;
  expiresAt?: string;
  revokedAt?: string;
  notes?: string;
}

export interface AudioStudioManuscriptRights {
  evidenceId: string;
  synthesisAuthorized: boolean;
  commercialUseAuthorized: boolean;
}

export interface AudioStudioVoiceBinding {
  engineKey: string;
  sourceKind: VoiceSourceKind;
  referenceManifest?: string;
  voiceRights: AudioStudioVoiceRightsRecord;
  manuscriptRights: AudioStudioManuscriptRights;
  commercialUse: boolean;
  maximumVramGb?: number;
  language?: string;
  channels?: 1 | 2;
}

export type AudioStudioBindingResolver = (
  request: SynthesisRequest,
) => AudioStudioVoiceBinding | Promise<AudioStudioVoiceBinding>;

export type AudioStudioFetch = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface AudioStudioVoiceAdapterOptions {
  baseUrl: string;
  resolveBinding: AudioStudioBindingResolver;
  fetch?: AudioStudioFetch;
  pollIntervalMs?: number;
  maximumPollIntervalMs?: number;
  healthCacheMs?: number;
}

export interface AudioStudioServiceHealth {
  schema: "evavo_voice_service_health_v1";
  service: string;
  version: string;
  capabilityFingerprint: string;
  features: readonly string[];
  maximumInputCharacters: number;
  supportedFormats: readonly string[];
  supportedSampleRatesHz: readonly number[];
  storesInputs: boolean;
  trainsOnCustomerData: boolean;
  customVoiceRequiresConsent: boolean;
}

export interface AudioStudioSubmission {
  schema: "evavo_voice_render_submission_v1";
  jobId: string;
  state: string;
  statusUrl: string;
}

export interface AudioStudioArtifactStatus {
  path: string;
  sha256: string;
  sizeBytes: number;
  contentType: string;
  media?: Readonly<Record<string, unknown>> | null;
}

export interface AudioStudioJobStatus {
  schema: "evavo_voice_job_status_v1";
  jobId: string;
  state: string;
  requestId: string;
  engineKey: string;
  engineLockFingerprint?: string;
  completedAt?: string;
  failure?: Readonly<Record<string, unknown>>;
  artifacts: readonly AudioStudioArtifactStatus[];
  artifactUrls?: readonly string[];
}

export interface AudioStudioCachedCapability {
  expiresAt: number;
  healthFingerprint: string;
  snapshot: ProviderCapabilitySnapshot;
}
