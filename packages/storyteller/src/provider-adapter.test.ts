import assert from "node:assert/strict";
import test from "node:test";
import {
  ProviderAdapterRegistry,
  buildSynthesisRequest,
  createCapabilitySnapshot,
  executeGenerationJob,
  type CredentialResolver,
  type NarrationProviderAdapter,
  type SynthesisRequest,
  type SynthesisResult,
} from "./provider-adapter.js";
import type { GenerationJob, PerformanceDirection } from "./index.js";

const direction: PerformanceDirection = {
  segmentId: "segment_001",
  narrativeDistance: "close",
  pace: 0.86,
  intensity: 0.42,
  warmth: 0.55,
  restraint: 0.8,
  clarity: 0.92,
  pauseBeforeMs: 120,
  pauseAfterMs: 240,
  emotionalObjective: "Ask for permission without appearing to need it.",
  subtext: "The decision is not as settled as the speaker claims.",
  notes: ["Protect the turn in the final clause."],
};

function job(overrides: Partial<GenerationJob> = {}): GenerationJob {
  return {
    id: "job_001",
    projectId: "project_001",
    segmentId: "segment_001",
    providerFallbackIds: ["primary-provider", "fallback-provider"],
    cacheKey: "a".repeat(64),
    candidateCount: 2,
    status: "ready",
    ...overrides,
  };
}

function request(candidateIndex: number): SynthesisRequest {
  return buildSynthesisRequest({
    job: job(),
    text: "The house kept its own weather.",
    immutableSourceHash: "b".repeat(64),
    voiceProfileId: "voice_narrator_001",
    voiceRevision: 3,
    direction,
    mode: "calibration",
    candidateIndex,
  });
}

function adapter(providerId: string, behaviour: "success" | "failure"): NarrationProviderAdapter {
  return {
    providerId,
    adapterVersion: "1.0.0",
    async inspectCapabilities() {
      return createCapabilitySnapshot({
        providerId,
        adapterVersion: "1.0.0",
        capturedAt: "2026-07-27T00:00:00.000Z",
        features: ["batch-long-form", "word-timestamps"],
        maximumInputCharacters: 10_000,
        supportedFormats: ["wav"],
        supportedSampleRatesHz: [48_000],
        regions: ["australia"],
        storesInputs: false,
        trainsOnCustomerData: false,
        customVoiceRequiresConsent: true,
      });
    },
    async synthesise(value): Promise<SynthesisResult> {
      if (behaviour === "failure") throw new Error("temporary provider outage");
      const capability = await this.inspectCapabilities({ credential: "credential" });
      return {
        providerId,
        adapterVersion: "1.0.0",
        requestId: value.requestId,
        idempotencyKey: value.idempotencyKey,
        providerRequestId: `provider_request_${value.candidateIndex}`,
        audio: new Uint8Array([82, 73, 70, 70]),
        contentType: "audio/wav",
        transcript: value.text,
        usage: {
          inputCharacters: value.text.length,
          outputSeconds: 1.8,
          providerUnits: value.text.length,
          estimatedCost: 0.01,
          currency: "AUD",
        },
        capabilityFingerprint: capability.fingerprint,
        generatedAt: "2026-07-27T00:00:00.000Z",
        provenance: {
          voiceProfileId: value.voiceProfileId,
          voiceRevision: value.voiceRevision,
          mode: value.mode,
        },
      };
    },
  };
}

const credentials: CredentialResolver = {
  async resolve(providerId) {
    return providerId === "fallback-provider" ? "server-only-token" : "primary-token";
  },
};

test("capability snapshots are deterministic across unordered capability sets", () => {
  const common = {
    providerId: "provider-1",
    adapterVersion: "1.2.3",
    capturedAt: "2026-07-27T00:00:00.000Z",
    maximumInputCharacters: 5_000,
    storesInputs: false,
    trainsOnCustomerData: false,
    customVoiceRequiresConsent: true,
  } as const;
  const first = createCapabilitySnapshot({
    ...common,
    features: ["word-timestamps", "batch-long-form"],
    supportedFormats: ["wav", "flac"],
    supportedSampleRatesHz: [48_000, 44_100],
    regions: ["australia", "global"],
  });
  const second = createCapabilitySnapshot({
    ...common,
    features: ["batch-long-form", "word-timestamps"],
    supportedFormats: ["flac", "wav"],
    supportedSampleRatesHz: [44_100, 48_000],
    regions: ["global", "australia"],
  });
  assert.equal(first.fingerprint, second.fingerprint);
});

test("synthesis requests remain stable and candidate-specific", () => {
  const first = request(0);
  const same = request(0);
  const second = request(1);
  assert.equal(first.idempotencyKey, same.idempotencyKey);
  assert.equal(first.requestId, same.requestId);
  assert.notEqual(first.idempotencyKey, second.idempotencyKey);
  assert.equal(first.metadata.jobId, "job_001");
});

test("adapter registry rejects duplicate provider identifiers", () => {
  const registry = new ProviderAdapterRegistry([adapter("primary-provider", "success")]);
  assert.throws(() => registry.register(adapter("primary-provider", "success")), /PROVIDER_ADAPTER_DUPLICATE/u);
});

test("execution falls back without approving failed provider output", async () => {
  const registry = new ProviderAdapterRegistry([
    adapter("primary-provider", "failure"),
    adapter("fallback-provider", "success"),
  ]);
  const report = await executeGenerationJob({
    job: job(),
    registry,
    credentials,
    requests: [request(0), request(1)],
  });
  assert.equal(report.status, "completed");
  assert.equal(report.results.length, 2);
  assert.equal(report.results.every((result) => result.providerId === "fallback-provider"), true);
  assert.equal(report.attempts.filter((attempt) => attempt.providerId === "primary-provider" && attempt.status === "failed").length, 2);
  assert.equal(report.attempts.filter((attempt) => attempt.providerId === "fallback-provider" && attempt.status === "succeeded").length, 2);
});

test("execution fails closed when credentials are unavailable", async () => {
  const registry = new ProviderAdapterRegistry([adapter("primary-provider", "success")]);
  const report = await executeGenerationJob({
    job: job({ providerFallbackIds: ["primary-provider"], candidateCount: 1 }),
    registry,
    credentials: { async resolve() { return null; } },
    requests: [request(0)],
  });
  assert.equal(report.status, "blocked");
  assert.equal(report.results.length, 0);
  assert.equal(report.findings[0]?.code, "GENERATION_CANDIDATE_UNRESOLVED");
});
