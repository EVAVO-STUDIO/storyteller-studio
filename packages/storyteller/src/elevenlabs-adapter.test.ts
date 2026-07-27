import assert from "node:assert/strict";
import test from "node:test";
import {
  ELEVENLABS_API_BASE_URL,
  ElevenLabsNarrationAdapter,
  assertElevenLabsPricingSnapshot,
  compileElevenLabsDirectionSettings,
  createElevenLabsPricingSnapshot,
  type ElevenLabsAdapterConfiguration,
  type ElevenLabsPricingSnapshot,
} from "./elevenlabs-adapter.js";
import type {
  ProviderExecutionContext,
  SynthesisRequest,
} from "./provider-adapter.js";
import type { PerformanceDirection } from "./index.js";

const t0 = new Date("2026-07-27T00:00:00.000Z");
const t1 = new Date("2026-07-27T00:01:00.000Z");

const direction: PerformanceDirection = {
  segmentId: "segment_elevenlabs_001",
  narrativeDistance: "close",
  pace: 0.86,
  intensity: 0.42,
  warmth: 0.53,
  restraint: 0.81,
  clarity: 0.94,
  pauseBeforeMs: 120,
  pauseAfterMs: 260,
  emotionalObjective: "Keep the listener close without announcing the pressure.",
  subtext: "The narrator knows more than the listener but does not reveal it yet.",
  notes: ["Protect the final word and the shape of the long sentence."],
};

function pricing(
  modelId: "eleven_multilingual_v2" | "eleven_v3",
  microsPerThousandCharacters = 120_000,
): ElevenLabsPricingSnapshot {
  return createElevenLabsPricingSnapshot({
    modelId,
    currency: "AUD",
    microsPerThousandCharacters,
    effectiveFrom: "2026-07-01T00:00:00.000Z",
    expiresAt: "2026-08-31T00:00:00.000Z",
    sourceReference: `elevenlabs-pricing-${modelId}-2026-07`,
  });
}

function configuration(
  fetchImpl: typeof fetch,
  overrides: Partial<ElevenLabsAdapterConfiguration> = {},
): ElevenLabsAdapterConfiguration {
  return {
    adapterVersion: "1.0.0",
    modelPolicies: [
      {
        mode: "preview",
        modelId: "eleven_v3",
        maximumInputCharacters: 3_000,
        pricing: pricing("eleven_v3", 240_000),
      },
      {
        mode: "calibration",
        modelId: "eleven_v3",
        maximumInputCharacters: 3_000,
        pricing: pricing("eleven_v3", 240_000),
      },
      {
        mode: "production",
        modelId: "eleven_multilingual_v2",
        maximumInputCharacters: 9_000,
        pricing: pricing("eleven_multilingual_v2"),
      },
    ],
    voiceBindings: [{
      voiceProfileId: "voice_profile_narrator_001",
      voiceRevision: 4,
      voiceId: "premadeVoice0001",
      sourceKind: "premade",
      licenceEvidenceId: "licence_elevenlabs_premade_001",
      commercialUseApproved: true,
      allowedModes: ["preview", "calibration", "production"],
    }],
    pronunciationDictionaries: [{
      writtenForm: "Aelwyn",
      approvedRevision: 2,
      pronunciationDictionaryId: "dictionary_aelwyn_001",
      versionId: "version_aelwyn_002",
    }],
    dataPolicy: {
      retentionMode: "zero-retention-enterprise",
      storesInputs: false,
      trainsOnCustomerData: false,
      policyVersion: "elevenlabs-enterprise-zero-retention-2026-07",
    },
    textNormalisation: "auto",
    outputBitrateKbps: 192,
    maximumResponseBytes: 4 * 1024 * 1024,
    preflightTimeoutMs: 5_000,
    now: () => t0,
    fetch: fetchImpl,
    ...overrides,
  };
}

function request(
  overrides: Partial<SynthesisRequest> = {},
): SynthesisRequest {
  return {
    requestId: "request_elevenlabs_001",
    idempotencyKey: `01234567${"a".repeat(56)}`,
    projectId: "project_elevenlabs_001",
    segmentId: direction.segmentId,
    immutableSourceHash: "b".repeat(64),
    text: "Aelwyn waited.",
    voiceProfileId: "voice_profile_narrator_001",
    voiceRevision: 4,
    direction,
    pronunciations: [{
      writtenForm: "Aelwyn",
      ipa: "ˈeɪlwɪn",
      approvedRevision: 2,
    }],
    mode: "production",
    format: "wav",
    sampleRateHz: 44_100,
    candidateIndex: 0,
    metadata: {
      jobId: "job_elevenlabs_001",
      projectId: "project_elevenlabs_001",
      segmentId: direction.segmentId,
    },
    ...overrides,
  };
}

function jsonResponse(
  value: unknown,
  input: ResponseInit = {},
): Response {
  const body = JSON.stringify(value);
  return new Response(body, {
    status: input.status ?? 200,
    headers: {
      "content-type": "application/json",
      "content-length": String(Buffer.byteLength(body)),
      ...(input.headers ?? {}),
    },
  });
}

function fetchFrom(
  handler: (url: string, init?: RequestInit) => Promise<Response> | Response,
): typeof fetch {
  return (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
    return await handler(url, init);
  }) as typeof fetch;
}

function modelsResponse(): Response {
  return jsonResponse([
    {
      model_id: "eleven_multilingual_v2",
      can_do_text_to_speech: true,
      max_characters_request: 10_000,
    },
    {
      model_id: "eleven_v3",
      can_do_text_to_speech: true,
      max_characters_request: 5_000,
    },
  ]);
}

function voiceResponse(category = "premade"): Response {
  return jsonResponse({
    voice_id: "premadeVoice0001",
    category,
    name: "Governed narrator fixture",
  });
}

function wavBytes(): Uint8Array {
  return new Uint8Array([
    0x52, 0x49, 0x46, 0x46,
    0x04, 0x00, 0x00, 0x00,
    0x57, 0x41, 0x56, 0x45,
    1, 2, 3, 4,
  ]);
}

function timestampResponse(text: string, audio = wavBytes()): Response {
  const characters = [...text];
  const starts = characters.map((_, index) => Number((index * 0.05).toFixed(3)));
  const ends = characters.map((_, index) => Number(((index + 1) * 0.05).toFixed(3)));
  return jsonResponse({
    audio_base64: Buffer.from(audio).toString("base64"),
    alignment: {
      characters,
      character_start_times_seconds: starts,
      character_end_times_seconds: ends,
    },
  }, {
    headers: { "request-id": "private-elevenlabs-request-001" },
  });
}

async function preflight(
  adapter: ElevenLabsNarrationAdapter,
  credential = "fixture-elevenlabs-credential",
): Promise<void> {
  await adapter.inspectCapabilities({ credential });
}

test("pricing snapshots are immutable, effective and expire explicitly", () => {
  const snapshot = pricing("eleven_multilingual_v2");
  assert.match(snapshot.fingerprint, /^[a-f0-9]{64}$/u);
  assert.doesNotThrow(() => assertElevenLabsPricingSnapshot(snapshot, t0));
  assert.throws(
    () => assertElevenLabsPricingSnapshot(snapshot, new Date(snapshot.expiresAt)),
    /ELEVENLABS_PRICING_EXPIRED/u,
  );
  assert.throws(
    () => assertElevenLabsPricingSnapshot({ ...snapshot, microsPerThousandCharacters: 1 }),
    /ELEVENLABS_PRICING_FINGERPRINT_INVALID/u,
  );
  assert.throws(
    () => createElevenLabsPricingSnapshot({
      modelId: "eleven_v3",
      currency: "aud",
      microsPerThousandCharacters: 1,
      effectiveFrom: t0.toISOString(),
      expiresAt: t1.toISOString(),
      sourceReference: "source-001",
    }),
    /ELEVENLABS_PRICING_CURRENCY_INVALID/u,
  );
});

test("direction compilation is deterministic and model aware", () => {
  const longForm = compileElevenLabsDirectionSettings(
    direction,
    "eleven_multilingual_v2",
  );
  assert.deepEqual(longForm, {
    stability: 0.678,
    similarity_boost: 0.889,
    style: 0,
    use_speaker_boost: true,
    speed: 0.86,
  });
  const expressive = compileElevenLabsDirectionSettings(direction, "eleven_v3");
  assert.deepEqual(expressive, { stability: 0.5 });
  assert.equal("speed" in expressive, false);
  assert.equal("style" in expressive, false);
});

test("configuration prohibits cloned voices and unapproved v3 production", () => {
  const fakeFetch = fetchFrom(() => modelsResponse());
  assert.throws(
    () => new ElevenLabsNarrationAdapter(configuration(fakeFetch, {
      voiceBindings: [{
        ...configuration(fakeFetch).voiceBindings[0]!,
        sourceKind: "cloned" as "premade",
      }],
    })),
    /ELEVENLABS_NON_STOCK_VOICE_PROHIBITED/u,
  );
  assert.throws(
    () => new ElevenLabsNarrationAdapter(configuration(fakeFetch, {
      modelPolicies: configuration(fakeFetch).modelPolicies.map((policy) =>
        policy.mode === "production"
          ? {
              ...policy,
              modelId: "eleven_v3",
              maximumInputCharacters: 3_000,
              pricing: pricing("eleven_v3"),
            }
          : policy
      ),
    })),
    /ELEVENLABS_V3_PRODUCTION_NOT_APPROVED/u,
  );
});

test("preflight verifies configured models and remote premade voice category", async () => {
  const calls: string[] = [];
  const adapter = new ElevenLabsNarrationAdapter(configuration(fetchFrom((url, init) => {
    calls.push(url);
    assert.equal(new Headers(init?.headers).get("xi-api-key"), "fixture-elevenlabs-credential");
    if (url.endsWith("/v1/models")) return modelsResponse();
    if (url.endsWith("/v1/voices/premadeVoice0001")) return voiceResponse();
    throw new Error(`unexpected ElevenLabs preflight URL: ${url}`);
  })));

  const snapshot = await adapter.inspectCapabilities({
    credential: "fixture-elevenlabs-credential",
  });
  assert.equal(snapshot.providerId, "elevenlabs");
  assert.equal(snapshot.maximumInputCharacters, 3_000);
  assert.deepEqual(snapshot.supportedFormats, ["wav", "mp3"]);
  assert.deepEqual(snapshot.supportedSampleRatesHz, [44_100]);
  assert.equal(snapshot.storesInputs, false);
  assert.equal(snapshot.trainsOnCustomerData, false);
  assert.equal(snapshot.customVoiceRequiresConsent, true);
  assert.equal(snapshot.features.includes("word-timestamps"), true);
  assert.equal(snapshot.features.includes("deterministic-seed"), true);
  assert.equal(calls.length, 2);
});

test("preflight rejects a remote clone even when local data is tampered", async () => {
  const adapter = new ElevenLabsNarrationAdapter(configuration(fetchFrom((url) =>
    url.endsWith("/v1/models") ? modelsResponse() : voiceResponse("cloned")
  )));
  await assert.rejects(
    adapter.inspectCapabilities({ credential: "fixture-elevenlabs-credential" }),
    /ELEVENLABS_REMOTE_NON_STOCK_VOICE_PROHIBITED/u,
  );
});

test("synthesis preserves source text, uses governed settings and returns exact alignment", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const input = request();
  const adapter = new ElevenLabsNarrationAdapter(configuration(fetchFrom((url, init) => {
    calls.push({ url, init });
    if (url.endsWith("/v1/models")) return modelsResponse();
    if (url.endsWith("/v1/voices/premadeVoice0001")) return voiceResponse();
    if (url.includes("/with-timestamps")) return timestampResponse(input.text);
    throw new Error(`unexpected ElevenLabs URL: ${url}`);
  })));
  await preflight(adapter);

  const result = await adapter.synthesise(input, {
    credential: "fixture-elevenlabs-credential",
    timeoutMs: 5_000,
  });
  const synthesisCall = calls.at(-1);
  assert.ok(synthesisCall);
  const url = new URL(synthesisCall.url);
  assert.equal(url.origin, ELEVENLABS_API_BASE_URL);
  assert.equal(
    url.pathname,
    "/v1/text-to-speech/premadeVoice0001/with-timestamps",
  );
  assert.equal(url.searchParams.get("output_format"), "wav_44100");
  assert.equal(url.searchParams.get("enable_logging"), "false");
  assert.equal(
    new Headers(synthesisCall.init?.headers).get("xi-api-key"),
    "fixture-elevenlabs-credential",
  );

  const body = JSON.parse(String(synthesisCall.init?.body)) as Record<string, unknown>;
  assert.equal(body.text, input.text);
  assert.equal(body.model_id, "eleven_multilingual_v2");
  assert.equal(body.seed, 0x01234567);
  assert.equal(body.apply_text_normalization, "auto");
  assert.deepEqual(body.voice_settings, {
    stability: 0.678,
    similarity_boost: 0.889,
    style: 0,
    use_speaker_boost: true,
    speed: 0.86,
  });
  assert.deepEqual(body.pronunciation_dictionary_locators, [{
    pronunciation_dictionary_id: "dictionary_aelwyn_001",
    version_id: "version_aelwyn_002",
  }]);
  assert.equal(JSON.stringify(body).includes(direction.emotionalObjective), false);
  assert.equal(JSON.stringify(body).includes(direction.subtext), false);
  assert.equal(JSON.stringify(body).includes("[whisper"), false);

  assert.equal(result.transcript, input.text);
  assert.equal(result.wordTimestamps?.length, 2);
  assert.deepEqual(result.wordTimestamps?.map((item) => item.word), [
    "Aelwyn",
    "waited.",
  ]);
  assert.equal(result.audio.byteLength, wavBytes().byteLength);
  assert.equal(result.contentType, "audio/wav");
  assert.equal(result.providerRequestId, "private-elevenlabs-request-001");
  assert.equal(result.usage.inputCharacters, input.text.length);
  assert.equal(result.usage.providerUnits, input.text.length);
  assert.equal(result.usage.estimatedCost, 0.00168);
  assert.equal(result.usage.currency, "AUD");
  assert.equal(result.provenance.sourceTextPreserved, true);
  assert.equal(result.provenance.modelId, "eleven_multilingual_v2");
  const serialised = JSON.stringify(result);
  assert.equal(serialised.includes("fixture-elevenlabs-credential"), false);
  assert.equal(serialised.includes("premadeVoice0001"), false);
});

test("policy gates reject unverified, mismatched, unsupported and unbound requests", async () => {
  const fakeFetch = fetchFrom((url) =>
    url.endsWith("/v1/models") ? modelsResponse() : voiceResponse()
  );
  const adapter = new ElevenLabsNarrationAdapter(configuration(fakeFetch));
  await assert.rejects(
    adapter.synthesise(request(), {
      credential: "fixture-elevenlabs-credential",
      timeoutMs: 5_000,
    }),
    /ELEVENLABS_PREFLIGHT_REQUIRED/u,
  );
  await preflight(adapter);

  await assert.rejects(
    adapter.synthesise(request({ voiceRevision: 5 }), {
      credential: "fixture-elevenlabs-credential",
      timeoutMs: 5_000,
    }),
    /ELEVENLABS_VOICE_REVISION_MISMATCH/u,
  );
  await assert.rejects(
    adapter.synthesise(request({ sampleRateHz: 48_000 }), {
      credential: "fixture-elevenlabs-credential",
      timeoutMs: 5_000,
    }),
    /ELEVENLABS_OUTPUT_CONFIGURATION_UNSUPPORTED/u,
  );
  await assert.rejects(
    adapter.synthesise(request({ format: "flac" }), {
      credential: "fixture-elevenlabs-credential",
      timeoutMs: 5_000,
    }),
    /ELEVENLABS_OUTPUT_CONFIGURATION_UNSUPPORTED/u,
  );
  await assert.rejects(
    adapter.synthesise(request({
      pronunciations: [{
        writtenForm: "Unknown",
        ipa: "ʌnˈnəʊn",
        approvedRevision: 1,
      }],
    }), {
      credential: "fixture-elevenlabs-credential",
      timeoutMs: 5_000,
    }),
    /ELEVENLABS_PRONUNCIATION_BINDING_REQUIRED/u,
  );
});

test("response validation rejects transcript drift, false media and oversized output", async () => {
  const source = request();
  const createAdapter = (response: Response, maximumResponseBytes = 4 * 1024 * 1024) =>
    new ElevenLabsNarrationAdapter(configuration(fetchFrom((url) => {
      if (url.endsWith("/v1/models")) return modelsResponse();
      if (url.endsWith("/v1/voices/premadeVoice0001")) return voiceResponse();
      return response;
    }), { maximumResponseBytes }));

  const drift = createAdapter(timestampResponse("Aelwyn waited!"));
  await preflight(drift);
  await assert.rejects(
    drift.synthesise(source, {
      credential: "fixture-elevenlabs-credential",
      timeoutMs: 5_000,
    }),
    /ELEVENLABS_ALIGNMENT_TEXT_MISMATCH/u,
  );

  const falseMedia = createAdapter(timestampResponse(source.text, new Uint8Array([
    0x49, 0x44, 0x33, 0x04, 0x00, 0x00,
  ])));
  await preflight(falseMedia);
  await assert.rejects(
    falseMedia.synthesise(source, {
      credential: "fixture-elevenlabs-credential",
      timeoutMs: 5_000,
    }),
    /ELEVENLABS_AUDIO_WAV_SIGNATURE_INVALID/u,
  );

  const oversizedAudio = new Uint8Array(1_100);
  oversizedAudio.set(wavBytes());
  const oversized = createAdapter(
    timestampResponse(source.text, oversizedAudio),
    1_024,
  );
  await preflight(oversized);
  await assert.rejects(
    oversized.synthesise(source, {
      credential: "fixture-elevenlabs-credential",
      timeoutMs: 5_000,
    }),
    /ELEVENLABS_AUDIO_SIZE_INVALID|ELEVENLABS_SYNTHESIS_RESPONSE_TOO_LARGE/u,
  );
});

test("HTTP failures are sanitised and never include provider payloads or credentials", async () => {
  const adapter = new ElevenLabsNarrationAdapter(configuration(fetchFrom((url) => {
    if (url.endsWith("/v1/models")) return modelsResponse();
    if (url.endsWith("/v1/voices/premadeVoice0001")) return voiceResponse();
    return jsonResponse({
      detail: "private provider error with manuscript and credential",
    }, { status: 429 });
  })));
  await preflight(adapter);
  await assert.rejects(
    adapter.synthesise(request(), {
      credential: "fixture-elevenlabs-credential",
      timeoutMs: 5_000,
    }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, "ELEVENLABS_HTTP_429");
      assert.equal(error.message.includes("fixture-elevenlabs-credential"), false);
      assert.equal(error.message.includes("manuscript"), false);
      return true;
    },
  );
});

test("v3 calibration sends only supported stability control and exact prose", async () => {
  const input = request({
    mode: "calibration",
    text: "Do not decorate the silence.",
    pronunciations: [],
  });
  let synthesisBody: Record<string, unknown> | undefined;
  const adapter = new ElevenLabsNarrationAdapter(configuration(fetchFrom((url, init) => {
    if (url.endsWith("/v1/models")) return modelsResponse();
    if (url.endsWith("/v1/voices/premadeVoice0001")) return voiceResponse();
    synthesisBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return timestampResponse(input.text);
  })));
  await preflight(adapter);
  await adapter.synthesise(input, {
    credential: "fixture-elevenlabs-credential",
    timeoutMs: 5_000,
  });
  assert.equal(synthesisBody?.text, input.text);
  assert.equal(synthesisBody?.model_id, "eleven_v3");
  assert.deepEqual(synthesisBody?.voice_settings, { stability: 0.5 });
  assert.equal(JSON.stringify(synthesisBody).includes("audio_tags"), false);
  assert.equal(JSON.stringify(synthesisBody).includes("["), false);
});
