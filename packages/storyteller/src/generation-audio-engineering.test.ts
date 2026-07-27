import assert from "node:assert/strict";
import test from "node:test";
import {
  analyseAudioEngineering,
  type AudioEngineeringCommand,
  type AudioEngineeringCommandResult,
  type AudioEngineeringRunner,
} from "./audio-engineering.js";
import {
  assertEvidenceMatchesGenerationPolicy,
  assertGenerationAudioEngineeringPolicy,
  createGenerationAudioEngineeringPolicy,
  generationAudioEngineeringPolicyPublicView,
} from "./generation-audio-engineering.js";
import {
  ACX_AUDIOBOOK_PROFILE,
  LOSSLESS_PRODUCTION_PROFILE,
} from "./index.js";

const t0 = new Date("2026-07-27T00:00:00.000Z");
const privateRoot = "/private/storyteller/audio-engineering";

function commandResult(stdout = "", stderr = ""): AudioEngineeringCommandResult {
  return { exitCode: 0, stdout, stderr, durationMs: 5 };
}

class FixtureRunner implements AudioEngineeringRunner {
  async run(command: AudioEngineeringCommand): Promise<AudioEngineeringCommandResult> {
    switch (command.stage) {
      case "ffprobe-version":
        return commandResult("ffprobe version 7.1\n");
      case "ffmpeg-version":
        return commandResult("ffmpeg version 7.1\n");
      case "probe":
        return commandResult(JSON.stringify({
          streams: [{
            codec_type: "audio",
            codec_name: "pcm_s24le",
            sample_rate: "44100",
            channels: 1,
            bit_rate: "192000",
            duration: "10",
          }],
          format: {
            format_name: "wav",
            duration: "10",
            bit_rate: "192000",
            size: "16",
          },
        }));
      case "astats":
        return commandResult([
          "RMS level dB: -20",
          "Peak level dB: -4",
          "Noise floor dB: -65",
          "Peak count: 0",
        ].join("\n"));
      case "loudnorm":
        return commandResult("", JSON.stringify({
          input_i: "-20",
          input_tp: "-4.2",
          input_lra: "4",
          input_thresh: "-30",
          target_offset: "0",
        }));
      case "silence":
        return commandResult("", [
          "silence_start: 0",
          "silence_end: 1 | silence_duration: 1",
          "silence_start: 9",
          "silence_end: 10 | silence_duration: 1",
        ].join("\n"));
    }
  }
}

function policy() {
  return createGenerationAudioEngineeringPolicy({
    profile: ACX_AUDIOBOOK_PROFILE,
    externalVersion: "acx-2026-07",
    reviewedAt: "2026-07-26T00:00:00.000Z",
    sourceReference: "acx-audio-submission-requirements-reviewed-2026-07",
    runner: new FixtureRunner(),
    ffprobePath: "/opt/media/ffprobe",
    ffmpegPath: "/opt/media/ffmpeg",
    timeoutMs: 30_000,
    maximumOutputBytes: 2 * 1024 * 1024,
    temporaryRoot: privateRoot,
    now: t0,
  });
}

test("generation engineering policy locks a reviewed profile and bounded private execution", () => {
  const value = policy();
  assert.equal(value.profile.profile.id, "acx-audiobook");
  assert.equal(value.profile.externalVersion, "acx-2026-07");
  assert.equal(value.timeoutMs, 30_000);
  assert.equal(value.maximumOutputBytes, 2 * 1024 * 1024);
  assertGenerationAudioEngineeringPolicy(value);

  const view = generationAudioEngineeringPolicyPublicView(value);
  assert.equal(view.profileId, "acx-audiobook");
  assert.equal(view.profileVersion, "acx-2026-07");
  assert.equal(view.runnerConfigured, true);
  const serialised = JSON.stringify(view);
  for (const forbidden of [
    privateRoot,
    "/opt/media/ffprobe",
    "/opt/media/ffmpeg",
    "acx-audio-submission-requirements-reviewed-2026-07",
  ]) assert.equal(serialised.includes(forbidden), false);
});

test("equivalent policy inputs produce the same profile fingerprint", () => {
  const first = policy();
  const second = policy();
  assert.equal(first.profile.fingerprint, second.profile.fingerprint);
  assert.equal(
    generationAudioEngineeringPolicyPublicView(first).profileFingerprint,
    generationAudioEngineeringPolicyPublicView(second).profileFingerprint,
  );
});

test("future review dates and unsafe executable or temporary paths fail closed", () => {
  assert.throws(
    () => createGenerationAudioEngineeringPolicy({
      profile: ACX_AUDIOBOOK_PROFILE,
      externalVersion: "acx-future",
      reviewedAt: "2026-07-28T00:00:00.000Z",
      sourceReference: "future-profile",
      now: t0,
    }),
    /AUDIO_ENGINEERING_PROFILE_REVIEW_IN_FUTURE/u,
  );
  assert.throws(
    () => createGenerationAudioEngineeringPolicy({
      profile: ACX_AUDIOBOOK_PROFILE,
      externalVersion: "acx-2026-07",
      reviewedAt: "2026-07-26T00:00:00.000Z",
      sourceReference: "reviewed-profile",
      ffmpegPath: "ffmpeg\n--unsafe",
      now: t0,
    }),
    /GENERATION_AUDIO_ENGINEERING_FFMPEG_PATH_INVALID/u,
  );
  assert.throws(
    () => createGenerationAudioEngineeringPolicy({
      profile: ACX_AUDIOBOOK_PROFILE,
      externalVersion: "acx-2026-07",
      reviewedAt: "2026-07-26T00:00:00.000Z",
      sourceReference: "reviewed-profile",
      temporaryRoot: "private\0escape",
      now: t0,
    }),
    /GENERATION_AUDIO_ENGINEERING_TEMP_ROOT_INVALID/u,
  );
});

test("bounded timeout and output controls are mandatory", () => {
  assert.throws(
    () => createGenerationAudioEngineeringPolicy({
      profile: ACX_AUDIOBOOK_PROFILE,
      externalVersion: "acx-2026-07",
      reviewedAt: "2026-07-26T00:00:00.000Z",
      sourceReference: "reviewed-profile",
      timeoutMs: 0,
      now: t0,
    }),
    /GENERATION_AUDIO_ENGINEERING_TIMEOUT_INVALID/u,
  );
  assert.throws(
    () => createGenerationAudioEngineeringPolicy({
      profile: ACX_AUDIOBOOK_PROFILE,
      externalVersion: "acx-2026-07",
      reviewedAt: "2026-07-26T00:00:00.000Z",
      sourceReference: "reviewed-profile",
      maximumOutputBytes: 0,
      now: t0,
    }),
    /GENERATION_AUDIO_ENGINEERING_OUTPUT_LIMIT_INVALID/u,
  );
});

test("independent evidence must match the exact generation policy profile", async () => {
  const value = policy();
  const evidence = await analyseAudioEngineering({
    audioPath: "/private/candidate.wav",
    inputContentHash: "a".repeat(64),
    inputByteCount: 16,
    profile: value.profile.profile,
    profileVersion: value.profile.externalVersion,
    profileReviewedAt: value.profile.reviewedAt,
    profileSourceReference: value.profile.sourceReference,
    runner: value.runner,
    now: t0,
  });
  assert.doesNotThrow(() => assertEvidenceMatchesGenerationPolicy(value, evidence));

  const other = createGenerationAudioEngineeringPolicy({
    profile: LOSSLESS_PRODUCTION_PROFILE,
    externalVersion: "evavo-lossless-2026-07",
    reviewedAt: "2026-07-26T00:00:00.000Z",
    sourceReference: "evavo-lossless-mastering-policy-2026-07",
    now: t0,
  });
  assert.throws(
    () => assertEvidenceMatchesGenerationPolicy(other, evidence),
    /GENERATION_AUDIO_ENGINEERING_EVIDENCE_PROFILE_MISMATCH/u,
  );
});
