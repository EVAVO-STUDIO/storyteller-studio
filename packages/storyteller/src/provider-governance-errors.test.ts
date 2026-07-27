import assert from "node:assert/strict";
import test from "node:test";
import type { GenerationJob } from "./index.js";
import {
  buildSynthesisRequest,
  executeGenerationJob,
  ProviderAdapterRegistry,
  type CredentialResolver,
  type NarrationProviderAdapter,
  type ProviderCapabilitySnapshot,
  type ProviderExecutionContext,
  type SynthesisRequest,
  type SynthesisResult,
} from "./provider-adapter.js";

const job: GenerationJob = {
  id: "job_provider_governance_001",
  projectId: "project_provider_governance_001",
  segmentId: "segment_provider_governance_001",
  providerFallbackIds: ["provider_governed"],
  cacheKey: "a".repeat(64),
  candidateCount: 1,
  status: "ready",
};

const request = buildSynthesisRequest({
  job,
  text: "The governed provider kept the final word intact.",
  immutableSourceHash: "b".repeat(64),
  voiceProfileId: "voice_provider_governance_001",
  voiceRevision: 1,
  direction: {
    segmentId: job.segmentId,
    narrativeDistance: "close",
    pace: 0.9,
    intensity: 0.3,
    warmth: 0.5,
    restraint: 0.8,
    clarity: 0.95,
    pauseBeforeMs: 120,
    pauseAfterMs: 240,
    emotionalObjective: "Preserve the listener relationship without display.",
    subtext: "The narrator knows more than the listener.",
    notes: ["Protect the final word."],
  },
  mode: "production",
  format: "wav",
  sampleRateHz: 44_100,
  candidateIndex: 0,
});

class Resolver implements CredentialResolver {
  async resolve(): Promise<string> {
    return "fixture-provider-governance-secret";
  }
}

class FailingAdapter implements NarrationProviderAdapter {
  readonly providerId = "provider_governed";
  readonly adapterVersion = "1.0.0";
  readonly #message: string;

  constructor(message: string) {
    this.#message = message;
  }

  async inspectCapabilities(): Promise<ProviderCapabilitySnapshot> {
    throw new Error("not used");
  }

  async synthesise(
    _request: SynthesisRequest,
    _context: ProviderExecutionContext,
  ): Promise<SynthesisResult> {
    throw new Error(this.#message);
  }
}

test("calibration drift remains a named non-retryable provider finding", async () => {
  const report = await executeGenerationJob({
    job,
    registry: new ProviderAdapterRegistry([
      new FailingAdapter("GENERATION_CALIBRATION_CAPABILITY_MISMATCH"),
    ]),
    credentials: new Resolver(),
    requests: [request],
  });

  assert.equal(report.status, "blocked");
  assert.equal(report.results.length, 0);
  assert.equal(report.attempts.length, 1);
  assert.deepEqual(
    report.attempts[0]?.findings.map((finding) => finding.code),
    ["GENERATION_CALIBRATION_CAPABILITY_MISMATCH"],
  );
  assert.equal(
    report.attempts[0]?.findings[0]?.message,
    "Provider output did not satisfy the approved production calibration lock.",
  );
});

test("arbitrary provider errors are sanitised and never copy secrets or manuscript text", async () => {
  const privateMessage = "account secret fixture-provider-governance-secret and manuscript prose";
  const report = await executeGenerationJob({
    job,
    registry: new ProviderAdapterRegistry([
      new FailingAdapter(privateMessage),
    ]),
    credentials: new Resolver(),
    requests: [request],
  });

  const serialised = JSON.stringify(report);
  assert.equal(report.status, "blocked");
  assert.deepEqual(
    report.attempts[0]?.findings.map((finding) => finding.code),
    ["PROVIDER_SYNTHESIS_FAILED"],
  );
  assert.equal(serialised.includes(privateMessage), false);
  assert.equal(serialised.includes("fixture-provider-governance-secret"), false);
  assert.equal(serialised.includes("manuscript prose"), false);
});
