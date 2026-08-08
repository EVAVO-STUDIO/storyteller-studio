import assert from "node:assert/strict";
import test from "node:test";

import { createWorkerProviderRegistry } from "./providers.js";

function bindings(): string {
  return JSON.stringify([{
    voiceProfileId: "voice_narrator_01",
    voiceRevision: 1,
    binding: {
      engineKey: "chatterbox-local",
      sourceKind: "authorised-clone",
      referenceManifest: "evavo-storage://voice-source/version_01",
      commercialUse: true,
      voiceRights: {
        schema: "evavo_voice_rights_record_v1",
        sourceSha256: "a".repeat(64),
        sourceTitle: "Authorised narrator reference",
        textRightsBasis: "owned",
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

test("worker registry includes the governed Audio Studio provider", () => {
  const registry = createWorkerProviderRegistry({
    workerEnabled: true,
    environment: {
      STORYTELLER_ELEVENLABS_ENABLED: "false",
      STORYTELLER_AUDIO_STUDIO_ENABLED: "true",
      STORYTELLER_AUDIO_STUDIO_BASE_URL: "http://127.0.0.1:8766",
      STORYTELLER_AUDIO_STUDIO_VOICE_BINDINGS: bindings(),
    },
    credentialBindings: {
      "evavo-audio-studio": "EVAVO_VOICE_SERVICE_TOKEN",
    },
    now: () => new Date("2026-08-08T10:00:00.000Z"),
  });
  assert.deepEqual(registry.ids(), ["evavo-audio-studio"]);
  assert.equal(registry.get("evavo-audio-studio")?.adapterVersion, "1.0.0");
});

test("disabled workers do not register or parse Audio Studio", () => {
  const registry = createWorkerProviderRegistry({
    workerEnabled: false,
    environment: {
      STORYTELLER_AUDIO_STUDIO_ENABLED: "not-a-boolean",
      STORYTELLER_AUDIO_STUDIO_VOICE_BINDINGS: "not-json",
    },
    credentialBindings: {},
  });
  assert.deepEqual(registry.ids(), []);
});
