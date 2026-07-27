import assert from "node:assert/strict";
import test from "node:test";
import {
  ACX_AUDIOBOOK_PROFILE,
  LOSSLESS_PRODUCTION_PROFILE,
} from "./index.js";
import {
  AudioEngineeringError,
  NodeAudioEngineeringRunner,
  analyseAudioEngineering,
  assertAudioEngineeringEvidence,
  audioEngineeringPublicView,
  parseAstatsAudio,
  parseFfprobeAudio,
  parseLoudnormAudio,
  parseSilenceDetect,
  type AudioEngineeringCommand,
  type AudioEngineeringCommandResult,
  type AudioEngineeringRunner,
  type AudioEngineeringStage,
} from "./audio-engineering.js";

const t0 = new Date("2026-07-27T00:00:00.000Z");
const privatePath = "/private/storyteller/projects/project_001/takes/take_001.wav";
const inputHash = "a".repeat(64);
const inputBytes = 960_000;

function commandResult(
  stdout = "",
  stderr = "",
): AudioEngineeringCommandResult {
  return Object.freeze({
    exitCode: 0,
    stdout,
    stderr,
    durationMs: 12,
  });
}

function ffprobePayload(overrides: Readonly<Record<string, unknown>> = {}): string {
  return JSON.stringify({
    streams: [{
      codec_type: "audio",
      codec_name: "pcm_s24le",
      sample_rate: "44100",
      channels: 1,
      bit_rate: "192000",
      duration: "10.000000",
    }],
    format: {
      format_name: "wav",
      duration: "10.000000",
      bit_rate: "192000",
      size: String(inputBytes),
      ...overrides,
    },
  });
}

const validAstats = [
  "lavfi.astats.Overall.RMS_level=-20.0000",
  "lavfi.astats.Overall.Peak_level=-4.0000",
  "lavfi.astats.Overall.Noise_floor=-65.0000",
  "lavfi.astats.Overall.Peak_count=0",
].join("\n");

const validLoudnorm = JSON.stringify({
  input_i: "-20.10",
  input_tp: "-4.20",
  input_lra: "4.10",
  input_thresh: "-30.00",
  target_offset: "0.10",
}, null, 2);

const validSilence = [
  "[silencedetect] silence_start: 0",
  "[silencedetect] silence_end: 1.2 | silence_duration: 1.2",
  "[silencedetect] silence_start: 9",
  "[silencedetect] silence_end: 10 | silence_duration: 1",
].join("\n");

class FixtureRunner implements AudioEngineeringRunner {
  readonly commands: AudioEngineeringCommand[] = [];
  readonly overrides: Partial<Record<AudioEngineeringStage, AudioEngineeringCommandResult>>;

  constructor(
    overrides: Partial<Record<AudioEngineeringStage, AudioEngineeringCommandResult>> = {},
  ) {
    this.overrides = overrides;
  }

  async run(command: AudioEngineeringCommand): Promise<AudioEngineeringCommandResult> {
    this.commands.push(command);
    const overridden = this.overrides[command.stage];
    if (overridden) return overridden;
    switch (command.stage) {
      case "ffprobe-version":
        return commandResult("ffprobe version 7.1 Copyright FFmpeg developers\n");
      case "ffmpeg-version":
        return commandResult("ffmpeg version 7.1 Copyright FFmpeg developers\n");
      case "probe":
        return commandResult(ffprobePayload());
      case "astats":
        return commandResult(validAstats);
      case "loudnorm":
        return commandResult("", `[Parsed_loudnorm] ${validLoudnorm}`);
      case "silence":
        return commandResult("", validSilence);
    }
  }
}

function analysisInput(
  runner: AudioEngineeringRunner,
  overrides: Partial<Parameters<typeof analyseAudioEngineering>[0]> = {},
): Parameters<typeof analyseAudioEngineering>[0] {
  return {
    audioPath: privatePath,
    inputContentHash: inputHash,
    inputByteCount: inputBytes,
    profile: ACX_AUDIOBOOK_PROFILE,
    profileVersion: "acx-2026-07",
    profileReviewedAt: "2026-07-26T00:00:00.000Z",
    profileSourceReference: "acx-audio-submission-requirements-reviewed-2026-07",
    runner,
    now: t0,
    ...overrides,
  };
}

test("independent engineering evidence passes compliant audio without retaining private paths", async () => {
  const runner = new FixtureRunner();
  const evidence = await analyseAudioEngineering(analysisInput(runner));

  assert.equal(evidence.eligible, true);
  assert.deepEqual(evidence.findings, []);
  assert.equal(evidence.metrics.rmsDb, -20);
  assert.equal(evidence.metrics.peakDb, -4);
  assert.equal(evidence.metrics.truePeakDb, -4.2);
  assert.equal(evidence.metrics.noiseFloorDb, -65);
  assert.equal(evidence.metrics.sampleRateHz, 44_100);
  assert.equal(evidence.metrics.bitRateKbps, 192);
  assert.equal(evidence.metrics.channels, 1);
  assert.equal(evidence.metrics.leadingSilenceMs, 1_200);
  assert.equal(evidence.metrics.trailingSilenceMs, 1_000);
  assert.equal(evidence.probe.observedByteCount, inputBytes);
  assert.equal(runner.commands.length, 6);
  assertAudioEngineeringEvidence(evidence);

  const serialised = JSON.stringify(evidence);
  assert.equal(serialised.includes(privatePath), false);
  assert.equal(serialised.includes("projects/project_001"), false);
  assert.equal(serialised.includes("-show_entries"), false);
  assert.equal(serialised.includes(validAstats), false);
  assert.equal(serialised.includes(validLoudnorm), false);
  assert.equal(serialised.includes(validSilence), false);
  for (const command of runner.commands) {
    assert.equal(command.args.includes(privatePath), command.stage !== "ffprobe-version" && command.stage !== "ffmpeg-version");
  }

  const publicView = audioEngineeringPublicView(evidence);
  assert.equal(publicView.eligible, true);
  assert.equal(publicView.profileId, "acx-audiobook");
  assert.equal(publicView.profileVersion, "acx-2026-07");
  assert.deepEqual(publicView.findingCodes, []);
  assert.equal(JSON.stringify(publicView).includes(privatePath), false);
});

test("engineering evidence rejects loud, clipped, noisy, low-rate stereo delivery", async () => {
  const runner = new FixtureRunner({
    probe: commandResult(JSON.stringify({
      streams: [{
        codec_type: "audio",
        codec_name: "mp3",
        sample_rate: "22050",
        channels: 2,
        bit_rate: "128000",
        duration: "10",
      }],
      format: {
        format_name: "mp3",
        duration: "10",
        bit_rate: "128000",
        size: String(inputBytes),
      },
    })),
    astats: commandResult([
      "lavfi.astats.Overall.RMS_level=-15",
      "lavfi.astats.Overall.Peak_level=0",
      "lavfi.astats.Overall.Noise_floor=-45",
      "lavfi.astats.Overall.Peak_count=42",
    ].join("\n")),
    loudnorm: commandResult("", JSON.stringify({
      input_i: "-15",
      input_tp: "0.3",
      input_lra: "1",
      input_thresh: "-25",
      target_offset: "-5",
    })),
    silence: commandResult("", [
      "silence_start: 0",
      "silence_end: 6 | silence_duration: 6",
      "silence_start: 4",
    ].join("\n")),
  });
  const evidence = await analyseAudioEngineering(analysisInput(runner));
  const codes = new Set(evidence.findings.map((finding) => finding.code));

  assert.equal(evidence.eligible, false);
  for (const code of [
    "AUDIO_RMS_OUT_OF_RANGE",
    "AUDIO_PEAK_TOO_HIGH",
    "AUDIO_NOISE_FLOOR_TOO_HIGH",
    "AUDIO_SAMPLE_RATE_LOW",
    "AUDIO_BIT_RATE_LOW",
    "AUDIO_CHANNEL_COUNT_INVALID",
    "AUDIO_CLIPPING_DETECTED",
    "AUDIO_LEADING_SILENCE_LONG",
    "AUDIO_TRAILING_SILENCE_LONG",
  ]) assert.equal(codes.has(code), true, code);
  assert.equal(evidence.metrics.clippedSampleCount, 42);
});

test("lossless production profile accepts 48 kHz mono without a delivery bitrate", async () => {
  const runner = new FixtureRunner({
    probe: commandResult(JSON.stringify({
      streams: [{
        codec_type: "audio",
        codec_name: "pcm_s24le",
        sample_rate: "48000",
        channels: 1,
        duration: "10",
      }],
      format: {
        format_name: "wav",
        duration: "10",
        size: String(inputBytes),
      },
    })),
    astats: commandResult([
      "RMS level dB: -20",
      "Peak level dB: -2",
      "Noise floor dB: -70",
      "Peak count: 0",
    ].join("\n")),
    loudnorm: commandResult("", JSON.stringify({
      input_i: "-20",
      input_tp: "-1.5",
      input_lra: "5",
      input_thresh: "-30",
      target_offset: "0",
    })),
  });
  const evidence = await analyseAudioEngineering(analysisInput(runner, {
    profile: LOSSLESS_PRODUCTION_PROFILE,
    profileVersion: "evavo-lossless-2026-07",
    profileSourceReference: "evavo-lossless-mastering-policy-2026-07",
  }));

  assert.equal(evidence.eligible, true);
  assert.equal(evidence.metrics.sampleRateHz, 48_000);
  assert.equal(evidence.metrics.bitRateKbps, undefined);
});

test("byte-count mismatch is a hard integrity failure", async () => {
  const runner = new FixtureRunner({
    probe: commandResult(ffprobePayload({ size: String(inputBytes - 1) })),
  });
  const evidence = await analyseAudioEngineering(analysisInput(runner));
  assert.equal(evidence.eligible, false);
  assert.equal(evidence.findings[0]?.code, "AUDIO_ENGINEERING_BYTE_COUNT_MISMATCH");
});

test("parsers reject malformed or incomplete tool output", () => {
  assert.throws(() => parseFfprobeAudio("{}"), /AUDIO_ENGINEERING_FFPROBE_AUDIO_MISSING/u);
  assert.throws(() => parseFfprobeAudio("not-json"), /AUDIO_ENGINEERING_FFPROBE_JSON_INVALID/u);
  assert.throws(() => parseAstatsAudio("Peak level dB: -2"), /AUDIO_ENGINEERING_Astats_RMS_MISSING/u);
  assert.throws(() => parseLoudnormAudio("no loudness json"), /AUDIO_ENGINEERING_LOUDNORM_JSON_MISSING/u);
  assert.throws(() => parseSilenceDetect("silence_start: nope", 10), /AUDIO_ENGINEERING_SILENCE_EVENT_INVALID|^$/u);
});

test("silence parser derives trailing silence when ffmpeg reports an open final interval", () => {
  const value = parseSilenceDetect([
    "silence_start: 0",
    "silence_end: 0.8 | silence_duration: 0.8",
    "silence_start: 9.25",
  ].join("\n"), 10);
  assert.deepEqual(value, {
    leadingSilenceMs: 800,
    trailingSilenceMs: 750,
    intervalCount: 2,
  });
});

test("raw runner errors are converted to stable codes without private diagnostic text", async () => {
  const runner: AudioEngineeringRunner = {
    async run(): Promise<AudioEngineeringCommandResult> {
      throw new Error(`provider leaked ${privatePath} and secret-material`);
    },
  };
  await assert.rejects(
    analyseAudioEngineering(analysisInput(runner)),
    (error: unknown) => {
      assert.ok(error instanceof AudioEngineeringError);
      assert.equal(error.message, "AUDIO_ENGINEERING_COMMAND_FAILED:ffprobe-version");
      assert.equal(error.message.includes(privatePath), false);
      assert.equal(error.message.includes("secret-material"), false);
      return true;
    },
  );
});

test("node runner enforces output and time bounds without a shell", async () => {
  const runner = new NodeAudioEngineeringRunner();
  await assert.rejects(
    runner.run({
      stage: "ffmpeg-version",
      executable: process.execPath,
      args: ["-e", "process.stdout.write('x'.repeat(2048))"],
      timeoutMs: 2_000,
      maximumOutputBytes: 64,
    }),
    /AUDIO_ENGINEERING_COMMAND_OUTPUT_TOO_LARGE/u,
  );
  await assert.rejects(
    runner.run({
      stage: "ffmpeg-version",
      executable: process.execPath,
      args: ["-e", "setTimeout(() => {}, 2000)"],
      timeoutMs: 50,
      maximumOutputBytes: 1_024,
    }),
    /AUDIO_ENGINEERING_COMMAND_TIMEOUT/u,
  );
});

test("profile chronology and evidence fingerprint tampering fail closed", async () => {
  const runner = new FixtureRunner();
  await assert.rejects(
    analyseAudioEngineering(analysisInput(runner, {
      profileReviewedAt: "2026-07-28T00:00:00.000Z",
    })),
    /AUDIO_ENGINEERING_PROFILE_REVIEW_IN_FUTURE/u,
  );

  const evidence = await analyseAudioEngineering(analysisInput(new FixtureRunner()));
  assert.throws(
    () => assertAudioEngineeringEvidence({
      ...evidence,
      fingerprint: "f".repeat(64),
    }),
    /AUDIO_ENGINEERING_FINGERPRINT_INVALID/u,
  );
  assert.throws(
    () => assertAudioEngineeringEvidence({
      ...evidence,
      tools: {
        ...evidence.tools,
        ffmpeg: {
          ...evidence.tools.ffmpeg,
          versionLine: "forged ffmpeg version",
        },
      },
      fingerprint: evidence.fingerprint,
    }),
    /AUDIO_ENGINEERING_TOOL_FINGERPRINT_INVALID/u,
  );
});
