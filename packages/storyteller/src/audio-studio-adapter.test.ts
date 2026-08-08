import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import test from "node:test";

import { stableHash, type PerformanceDirection } from "./index.js";
import {
  AudioStudioVoiceAdapter,
  type AudioStudioVoiceBinding,
} from "./audio-studio-adapter.js";
import type { SynthesisRequest } from "./provider-adapter.js";

const direction: PerformanceDirection = {
  segmentId: "segment_01",
  narrativeDistance: "close",
  pace: 0.94,
  intensity: 0.42,
  warmth: 0.61,
  restraint: 0.77,
  clarity: 0.9,
  pauseBeforeMs: 120,
  pauseAfterMs: 280,
  emotionalObjective: "Build restrained unease without melodrama.",
  subtext: "The narrator knows more than the listener.",
  notes: ["Keep the final phrase intimate."],
};

function synthesisRequest(): SynthesisRequest {
  return {
    requestId: "request_test_01",
    idempotencyKey: stableHash("audio-studio-adapter-test"),
    projectId: "project_01",
    segmentId: "segment_01",
    immutableSourceHash: stableHash("immutable manuscript"),
    text: "The lamp burned lower as the footsteps stopped beyond the door.",
    voiceProfileId: "voice_narrator_01",
    voiceRevision: 3,
    direction,
    pronunciations: [{
      writtenForm: "Blackmere",
      spokenForm: "Black-meer",
      approvedRevision: 2,
    }],
    mode: "production",
    format: "wav",
    sampleRateHz: 48_000,
    candidateIndex: 0,
    metadata: {
      language: "en-AU",
      previousContext: "The room has become unnaturally quiet.",
      nextContext: "Someone tests the door latch.",
    },
  };
}

function binding(): AudioStudioVoiceBinding {
  return {
    engineKey: "chatterbox-local",
    sourceKind: "authorised-clone",
    referenceManifest: "evavo-storage://voice-source/version_01",
    commercialUse: true,
    maximumVramGb: 16,
    voiceRights: {
      schema: "evavo_voice_rights_record_v1",
      sourceSha256: stableHash("owned narrator source"),
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
  };
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("Audio Studio adapter submits directed governed audio and returns unapproved bytes", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  let statusCalls = 0;
  const submittedPayloads: Record<string, unknown>[] = [];
  const audio = new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4]);

  const adapter = new AudioStudioVoiceAdapter({
    baseUrl: "http://127.0.0.1:8766",
    resolveBinding: () => binding(),
    pollIntervalMs: 10,
    maximumPollIntervalMs: 10,
    healthCacheMs: 60_000,
    fetch: async (input, init) => {
      const url = String(input);
      calls.push({ url, ...(init ? { init } : {}) });
      if (url.endsWith("/health")) {
        return jsonResponse({
          ok: true,
          result: {
            schema: "evavo_voice_service_health_v1",
            service: "evavo-audio-studio-voice-lab",
            version: "1.0.0",
            capabilityFingerprint: stableHash("voice service capability"),
            features: [
              "batch-long-form",
              "pronunciation-dictionary",
              "phoneme-control",
              "deterministic-seed",
              "local-runtime",
              "style-instructions",
            ],
            maximumInputCharacters: 20_000,
            supportedFormats: ["wav", "flac", "mp3"],
            supportedSampleRatesHz: [24_000, 44_100, 48_000],
            storesInputs: true,
            trainsOnCustomerData: false,
            customVoiceRequiresConsent: true,
          },
        });
      }
      if (url.endsWith("/v1/voice/renders") && init?.method === "POST") {
        submittedPayloads.push(
          JSON.parse(String(init.body)) as Record<string, unknown>,
        );
        return jsonResponse({
          ok: true,
          result: {
            schema: "evavo_voice_render_submission_v1",
            jobId: `voicejob_${synthesisRequest().idempotencyKey.slice(0, 24)}`,
            state: "queued",
            statusUrl: `/v1/voice/renders/voicejob_${synthesisRequest().idempotencyKey.slice(0, 24)}`,
          },
        }, 202);
      }
      if (url.includes("/v1/voice/renders/voicejob_")) {
        statusCalls += 1;
        const completed = statusCalls > 1;
        return jsonResponse({
          ok: true,
          result: {
            schema: "evavo_voice_job_status_v1",
            jobId: `voicejob_${synthesisRequest().idempotencyKey.slice(0, 24)}`,
            state: completed ? "completed" : "running",
            requestId: synthesisRequest().requestId,
            engineKey: "chatterbox-local",
            engineLockFingerprint: stableHash("engine lock"),
            ...(completed ? { completedAt: "2026-08-08T09:00:00.000Z" } : {}),
            artifacts: completed
              ? [{
                  path: "take-000.wav",
                  sha256: createHash("sha256").update(audio).digest("hex"),
                  sizeBytes: audio.byteLength,
                  contentType: "audio/wav",
                }]
              : [],
            ...(completed
              ? {
                  artifactUrls: [
                    `/v1/voice/artifacts/voicejob_${synthesisRequest().idempotencyKey.slice(0, 24)}/take-000.wav`,
                  ],
                }
              : {}),
            publicationAuthority: false,
          },
        });
      }
      if (url.includes("/v1/voice/artifacts/voicejob_")) {
        return new Response(audio, {
          status: 200,
          headers: { "content-type": "audio/wav" },
        });
      }
      return jsonResponse({ ok: false, error: "not found" }, 404);
    },
  });

  const request = synthesisRequest();
  const result = await adapter.synthesise(request, {
    credential: "local-test-token",
    timeoutMs: 2_000,
  });

  assert.equal(result.providerId, "evavo-audio-studio");
  assert.equal(result.audio.byteLength, audio.byteLength);
  assert.equal(result.contentType, "audio/wav");
  assert.equal(result.provenance.storytellerTakeApproval, false);
  assert.equal(result.provenance.publicationAuthority, false);
  assert.ok(calls.some((call) => call.url.endsWith("/health")));
  assert.ok(calls.some((call) => call.url.endsWith("/v1/voice/renders")));
  assert.ok(calls.every((call) =>
    new Headers(call.init?.headers).get("authorization") === "Bearer local-test-token"
  ));
  assert.ok(calls.every((call) => call.init?.redirect === "error"));
  assert.ok(calls.every((call) => call.init?.cache === "no-store"));
  assert.equal(submittedPayloads.length, 1);
  const submitted = submittedPayloads[0] as Record<string, unknown>;
  assert.equal(submitted.schema, "evavo_voice_render_request_v1");
  assert.deepEqual(
    (submitted.direction as Record<string, unknown>).previousContext,
    request.metadata.previousContext,
  );
  assert.equal(
    ((submitted.enginePolicy as Record<string, unknown>).commercialUse),
    true,
  );
  assert.equal(
    ((submitted.voiceRights as Record<string, unknown>).performerConsentBasis),
    "contract",
  );
});

test("Audio Studio adapter rejects non-loopback plaintext endpoints", () => {
  assert.throws(
    () => new AudioStudioVoiceAdapter({
      baseUrl: "http://voice.example.test:8766",
      resolveBinding: () => binding(),
    }),
    /AUDIO_STUDIO_HTTP_REQUIRES_LOOPBACK/u,
  );
});

test("Audio Studio adapter blocks commercial synthesis without both rights grants", async () => {
  const request = synthesisRequest();
  const denied = binding();
  denied.manuscriptRights = {
    ...denied.manuscriptRights,
    commercialUseAuthorized: false,
  };
  const adapter = new AudioStudioVoiceAdapter({
    baseUrl: "http://127.0.0.1:8766",
    resolveBinding: () => denied,
    fetch: async () => {
      throw new Error("fetch should not run before rights validation");
    },
  });
  await assert.rejects(
    () => adapter.synthesise(request, {
      credential: "local-test-token",
      timeoutMs: 1_000,
    }),
    /AUDIO_STUDIO_COMMERCIAL_RIGHTS_NOT_AUTHORISED/u,
  );
});

test("Audio Studio adapter refuses cross-origin status and artifact URLs", async () => {
  const adapter = new AudioStudioVoiceAdapter({
    baseUrl: "http://127.0.0.1:8766",
    resolveBinding: () => binding(),
    fetch: async (input, init) => {
      const url = String(input);
      if (url.endsWith("/health")) {
        return jsonResponse({
          ok: true,
          result: {
            schema: "evavo_voice_service_health_v1",
            service: "evavo-audio-studio-voice-lab",
            version: "1.0.0",
            capabilityFingerprint: stableHash("cross-origin-test"),
            features: ["local-runtime"],
            maximumInputCharacters: 20_000,
            supportedFormats: ["wav"],
            supportedSampleRatesHz: [48_000],
            storesInputs: true,
            trainsOnCustomerData: false,
            customVoiceRequiresConsent: true,
          },
        });
      }
      if (url.endsWith("/v1/voice/renders") && init?.method === "POST") {
        return jsonResponse({
          ok: true,
          result: {
            schema: "evavo_voice_render_submission_v1",
            jobId: `voicejob_${synthesisRequest().idempotencyKey.slice(0, 24)}`,
            state: "queued",
            statusUrl: "https://untrusted.example.test/steal-token",
          },
        }, 202);
      }
      throw new Error("cross-origin URL must be rejected before fetch");
    },
  });

  await assert.rejects(
    () => adapter.synthesise(synthesisRequest(), {
      credential: "local-test-token",
      timeoutMs: 1_000,
    }),
    /AUDIO_STUDIO_STATUS_URL_CROSS_ORIGIN/u,
  );
});

test("Audio Studio adapter rejects credentials containing whitespace", async () => {
  const adapter = new AudioStudioVoiceAdapter({
    baseUrl: "http://127.0.0.1:8766",
    resolveBinding: () => binding(),
    fetch: async () => {
      throw new Error("credential validation must happen before fetch");
    },
  });
  await assert.rejects(
    () => adapter.inspectCapabilities({ credential: "unsafe token" }),
    /AUDIO_STUDIO_CREDENTIAL_INVALID/u,
  );
});

test("Audio Studio adapter rejects a service that trains on customer data", async () => {
  const adapter = new AudioStudioVoiceAdapter({
    baseUrl: "http://127.0.0.1:8766",
    resolveBinding: () => binding(),
    fetch: async () => jsonResponse({
      ok: true,
      result: {
        schema: "evavo_voice_service_health_v1",
        service: "unsafe-voice-service",
        version: "1.0.0",
        capabilityFingerprint: stableHash("unsafe-voice-service"),
        features: ["local-runtime"],
        maximumInputCharacters: 20_000,
        supportedFormats: ["wav"],
        supportedSampleRatesHz: [48_000],
        storesInputs: true,
        trainsOnCustomerData: true,
        customVoiceRequiresConsent: true,
      },
    }),
  });
  await assert.rejects(
    () => adapter.inspectCapabilities({ credential: "local-test-token" }),
    /AUDIO_STUDIO_CUSTOMER_DATA_TRAINING_FORBIDDEN/u,
  );
});

test("Audio Studio adapter blocks unresolved source rights before fetch", async () => {
  const unresolved = binding();
  unresolved.voiceRights = {
    ...unresolved.voiceRights,
    recordingRightsBasis: "unknown",
  };
  const adapter = new AudioStudioVoiceAdapter({
    baseUrl: "http://127.0.0.1:8766",
    resolveBinding: () => unresolved,
    fetch: async () => {
      throw new Error("rights validation must happen before fetch");
    },
  });
  await assert.rejects(
    () => adapter.synthesise(synthesisRequest(), {
      credential: "local-test-token",
      timeoutMs: 1_000,
    }),
    /AUDIO_STUDIO_SOURCE_RIGHTS_UNRESOLVED/u,
  );
});

test("Audio Studio adapter rejects receipt-declared oversized artifacts before download", async () => {
  const request = synthesisRequest();
  let artifactFetches = 0;
  const adapter = new AudioStudioVoiceAdapter({
    baseUrl: "http://127.0.0.1:8766",
    resolveBinding: () => binding(),
    maximumArtifactBytes: 1_024,
    pollIntervalMs: 10,
    maximumPollIntervalMs: 10,
    fetch: async (input, init) => {
      const url = String(input);
      if (url.endsWith("/health")) {
        return jsonResponse({
          ok: true,
          result: {
            schema: "evavo_voice_service_health_v1",
            service: "evavo-audio-studio-voice-lab",
            version: "1.0.0",
            capabilityFingerprint: stableHash("oversized-artifact-health"),
            features: ["local-runtime"],
            maximumInputCharacters: 20_000,
            supportedFormats: ["wav"],
            supportedSampleRatesHz: [48_000],
            storesInputs: true,
            trainsOnCustomerData: false,
            customVoiceRequiresConsent: true,
          },
        });
      }
      if (url.endsWith("/v1/voice/renders") && init?.method === "POST") {
        return jsonResponse({
          ok: true,
          result: {
            schema: "evavo_voice_render_submission_v1",
            jobId: `voicejob_${request.idempotencyKey.slice(0, 24)}`,
            state: "queued",
            statusUrl: `/v1/voice/renders/voicejob_${request.idempotencyKey.slice(0, 24)}`,
          },
        }, 202);
      }
      if (url.includes("/v1/voice/renders/voicejob_")) {
        return jsonResponse({
          ok: true,
          result: {
            schema: "evavo_voice_job_status_v1",
            jobId: `voicejob_${request.idempotencyKey.slice(0, 24)}`,
            state: "completed",
            requestId: request.requestId,
            engineKey: "chatterbox-local",
            engineLockFingerprint: stableHash("oversized-engine-lock"),
            completedAt: "2026-08-08T09:00:00.000Z",
            artifacts: [{
              path: "take-000.wav",
              sha256: "a".repeat(64),
              sizeBytes: 2_048,
              contentType: "audio/wav",
            }],
            artifactUrls: [
              `/v1/voice/artifacts/voicejob_${request.idempotencyKey.slice(0, 24)}/take-000.wav`,
            ],
          },
        });
      }
      artifactFetches += 1;
      return new Response(new Uint8Array(2_048), {
        status: 200,
        headers: { "content-type": "audio/wav" },
      });
    },
  });

  await assert.rejects(
    () => adapter.synthesise(request, {
      credential: "local-test-token",
      timeoutMs: 2_000,
    }),
    /AUDIO_STUDIO_ARTIFACT_TOO_LARGE/u,
  );
  assert.equal(artifactFetches, 0);
});

test("Audio Studio adapter stops a chunked artifact that exceeds the byte cap", async () => {
  const request = synthesisRequest();
  const expected = new Uint8Array(1_000);
  const adapter = new AudioStudioVoiceAdapter({
    baseUrl: "http://127.0.0.1:8766",
    resolveBinding: () => binding(),
    maximumArtifactBytes: 1_024,
    pollIntervalMs: 10,
    maximumPollIntervalMs: 10,
    fetch: async (input, init) => {
      const url = String(input);
      if (url.endsWith("/health")) {
        return jsonResponse({
          ok: true,
          result: {
            schema: "evavo_voice_service_health_v1",
            service: "evavo-audio-studio-voice-lab",
            version: "1.0.0",
            capabilityFingerprint: stableHash("chunked-artifact-health"),
            features: ["local-runtime"],
            maximumInputCharacters: 20_000,
            supportedFormats: ["wav"],
            supportedSampleRatesHz: [48_000],
            storesInputs: true,
            trainsOnCustomerData: false,
            customVoiceRequiresConsent: true,
          },
        });
      }
      if (url.endsWith("/v1/voice/renders") && init?.method === "POST") {
        return jsonResponse({
          ok: true,
          result: {
            schema: "evavo_voice_render_submission_v1",
            jobId: `voicejob_${request.idempotencyKey.slice(0, 24)}`,
            state: "queued",
            statusUrl: `/v1/voice/renders/voicejob_${request.idempotencyKey.slice(0, 24)}`,
          },
        }, 202);
      }
      if (url.includes("/v1/voice/renders/voicejob_")) {
        return jsonResponse({
          ok: true,
          result: {
            schema: "evavo_voice_job_status_v1",
            jobId: `voicejob_${request.idempotencyKey.slice(0, 24)}`,
            state: "completed",
            requestId: request.requestId,
            engineKey: "chatterbox-local",
            engineLockFingerprint: stableHash("chunked-engine-lock"),
            completedAt: "2026-08-08T09:00:00.000Z",
            artifacts: [{
              path: "take-000.wav",
              sha256: createHash("sha256").update(expected).digest("hex"),
              sizeBytes: expected.byteLength,
              contentType: "audio/wav",
            }],
            artifactUrls: [
              `/v1/voice/artifacts/voicejob_${request.idempotencyKey.slice(0, 24)}/take-000.wav`,
            ],
          },
        });
      }
      let emitted = 0;
      return new Response(new ReadableStream<Uint8Array>({
        pull(controller) {
          if (emitted === 2) {
            controller.close();
            return;
          }
          controller.enqueue(new Uint8Array(600));
          emitted += 1;
        },
      }), {
        status: 200,
        headers: { "content-type": "audio/wav" },
      });
    },
  });

  await assert.rejects(
    () => adapter.synthesise(request, {
      credential: "local-test-token",
      timeoutMs: 2_000,
    }),
    /AUDIO_STUDIO_ARTIFACT_TOO_LARGE/u,
  );
});
