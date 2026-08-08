import assert from "node:assert/strict";
import test from "node:test";
import type { SynthesisRequest } from "@evavo/storyteller-engine/provider-adapter";

import {
  AUDIO_STUDIO_CREDENTIAL_BINDING_ID,
  audioStudioWorkerProviderSummary,
  resolveAudioStudioWorkerProvider,
} from "./audio-studio-provider.js";

const NOW = () => new Date("2026-08-08T10:00:00.000Z");

function configuredBindings(): string {
  return JSON.stringify([{
    voiceProfileId: "voice_narrator_01",
    voiceRevision: 3,
    projectId: "project_01",
    binding: {
      engineKey: "chatterbox-local",
      sourceKind: "authorised-clone",
      referenceManifest: "evavo-storage://voice-source/version_01",
      commercialUse: true,
      maximumVramGb: 16,
      language: "en-AU",
      channels: 1,
      voiceRights: {
        schema: "evavo_voice_rights_record_v1",
        sourceSha256: "a".repeat(64),
        sourceTitle: "Commissioned narrator reference",
        textRightsBasis: "licensed",
        recordingRightsBasis: "commissioned",
        performerIdentity: "Narrator 01",
        performerConsentBasis: "contract",
        operations: ["create_voice_reference", "synthesise", "commercial_use"],
        evidenceRefs: ["evavo-storage://rights/narrator-01-contract-v1"],
        commercialUseAuthorized: true,
        publicDistributionAuthorized: false,
      },
      manuscriptRights: {
        evidenceId: "rights_manuscript_project_01",
        synthesisAuthorized: true,
        commercialUseAuthorized: true,
      },
    },
  }]);
}

function environment(): Record<string, string> {
  return {
    STORYTELLER_AUDIO_STUDIO_ENABLED: "true",
    STORYTELLER_AUDIO_STUDIO_BASE_URL: "http://127.0.0.1:8766",
    STORYTELLER_AUDIO_STUDIO_VOICE_BINDINGS: configuredBindings(),
  };
}

test("Audio Studio worker provider remains disabled by default", () => {
  const provider = resolveAudioStudioWorkerProvider({
    workerEnabled: true,
    environment: {},
    credentialBindings: {},
  });
  assert.equal(provider, null);
  assert.deepEqual(audioStudioWorkerProviderSummary(provider), {
    enabled: false,
    providerId: "evavo-audio-studio",
    bindingCount: 0,
    projectScopedBindingCount: 0,
    baseUrl: null,
    localOnly: true,
  });
});

test("disabled workers do not parse provider configuration", () => {
  const provider = resolveAudioStudioWorkerProvider({
    workerEnabled: false,
    environment: {
      STORYTELLER_AUDIO_STUDIO_ENABLED: "not-a-boolean",
      STORYTELLER_AUDIO_STUDIO_VOICE_BINDINGS: "not-json",
    },
    credentialBindings: {},
  });
  assert.equal(provider, null);
});

test("Audio Studio worker provider requires a credential binding", () => {
  assert.throws(
    () => resolveAudioStudioWorkerProvider({
      workerEnabled: true,
      environment: environment(),
      credentialBindings: {},
      now: NOW,
    }),
    /AUDIO_STUDIO_WORKER_CREDENTIAL_BINDING_REQUIRED/u,
  );
});

test("Audio Studio worker provider registers validated project bindings", () => {
  const provider = resolveAudioStudioWorkerProvider({
    workerEnabled: true,
    environment: environment(),
    credentialBindings: {
      [AUDIO_STUDIO_CREDENTIAL_BINDING_ID]: "EVAVO_VOICE_SERVICE_TOKEN",
    },
    now: NOW,
  });
  assert.ok(provider);
  assert.equal(provider.adapter.providerId, "evavo-audio-studio");
  assert.deepEqual(provider.summary, {
    enabled: true,
    providerId: "evavo-audio-studio",
    bindingCount: 1,
    projectScopedBindingCount: 1,
    baseUrl: "http://127.0.0.1:8766",
    localOnly: true,
  });
});

test("Audio Studio worker provider rejects non-loopback execution", () => {
  assert.throws(
    () => resolveAudioStudioWorkerProvider({
      workerEnabled: true,
      environment: {
        ...environment(),
        STORYTELLER_AUDIO_STUDIO_BASE_URL: "https://voice.example.test",
      },
      credentialBindings: {
        [AUDIO_STUDIO_CREDENTIAL_BINDING_ID]: "EVAVO_VOICE_SERVICE_TOKEN",
      },
      now: NOW,
    }),
    /AUDIO_STUDIO_WORKER_LOOPBACK_URL_REQUIRED/u,
  );
});

test("Audio Studio worker provider rejects unresolved source rights at startup", () => {
  const rows = JSON.parse(configuredBindings()) as Array<Record<string, unknown>>;
  const binding = rows[0]?.binding as Record<string, unknown>;
  const rights = binding.voiceRights as Record<string, unknown>;
  rights.recordingRightsBasis = "unknown";
  assert.throws(
    () => resolveAudioStudioWorkerProvider({
      workerEnabled: true,
      environment: {
        ...environment(),
        STORYTELLER_AUDIO_STUDIO_VOICE_BINDINGS: JSON.stringify(rows),
      },
      credentialBindings: {
        [AUDIO_STUDIO_CREDENTIAL_BINDING_ID]: "EVAVO_VOICE_SERVICE_TOKEN",
      },
      now: NOW,
    }),
    /AUDIO_STUDIO_SOURCE_RIGHTS_UNRESOLVED/u,
  );
});

test("Audio Studio worker provider rejects duplicate binding identities", () => {
  const first = JSON.parse(configuredBindings()) as unknown[];
  assert.throws(
    () => resolveAudioStudioWorkerProvider({
      workerEnabled: true,
      environment: {
        ...environment(),
        STORYTELLER_AUDIO_STUDIO_VOICE_BINDINGS: JSON.stringify([...first, ...first]),
      },
      credentialBindings: {
        [AUDIO_STUDIO_CREDENTIAL_BINDING_ID]: "EVAVO_VOICE_SERVICE_TOKEN",
      },
      now: NOW,
    }),
    /AUDIO_STUDIO_WORKER_BINDING_DUPLICATE/u,
  );
});


test("Audio Studio worker binding resolver fails closed for an unconfigured voice", async () => {
  const provider = resolveAudioStudioWorkerProvider({
    workerEnabled: true,
    environment: environment(),
    credentialBindings: {
      [AUDIO_STUDIO_CREDENTIAL_BINDING_ID]: "EVAVO_VOICE_SERVICE_TOKEN",
    },
    now: NOW,
    fetch: async () => {
      throw new Error("binding resolution must happen before fetch");
    },
  });
  assert.ok(provider);
  const request: SynthesisRequest = {
    requestId: "request_unconfigured_voice",
    idempotencyKey: "b".repeat(64),
    projectId: "project_01",
    segmentId: "segment_01",
    immutableSourceHash: "c".repeat(64),
    text: "This request has no approved voice binding.",
    voiceProfileId: "voice_unconfigured_01",
    voiceRevision: 1,
    direction: {
      segmentId: "segment_01",
      narrativeDistance: "balanced",
      pace: 1,
      intensity: 0.5,
      warmth: 0.5,
      restraint: 0.5,
      clarity: 1,
      pauseBeforeMs: 0,
      pauseAfterMs: 0,
      emotionalObjective: "Validate fail-closed resolution.",
      subtext: "No binding exists.",
      notes: [],
    },
    pronunciations: [],
    mode: "production",
    format: "wav",
    sampleRateHz: 48_000,
    candidateIndex: 0,
    metadata: {},
  };
  await assert.rejects(
    () => provider.adapter.synthesise(request, {
      credential: "local-test-token",
      timeoutMs: 1_000,
    }),
    /AUDIO_STUDIO_WORKER_VOICE_BINDING_NOT_FOUND/u,
  );
});
