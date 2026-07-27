import assert from "node:assert/strict";
import test from "node:test";
import type {
  AudioEngineeringCommand,
  AudioEngineeringCommandResult,
  AudioEngineeringRunner,
} from "@evavo/storyteller-engine/audio-engineering";
import {
  resolveWorkerAudioEngineeringPolicy,
  workerAudioEngineeringPolicySummary,
} from "./audio-engineering.js";

const t0 = new Date("2026-07-27T00:00:00.000Z");

class FixtureRunner implements AudioEngineeringRunner {
  async run(_command: AudioEngineeringCommand): Promise<AudioEngineeringCommandResult> {
    return { exitCode: 0, stdout: "", stderr: "", durationMs: 0 };
  }
}

function environment() {
  return {
    STORYTELLER_AUDIO_ENGINEERING_PROFILE: "acx-audiobook",
    STORYTELLER_AUDIO_ENGINEERING_PROFILE_VERSION: "acx-2026-07",
    STORYTELLER_AUDIO_ENGINEERING_PROFILE_REVIEWED_AT: "2026-07-26T00:00:00.000Z",
    STORYTELLER_AUDIO_ENGINEERING_PROFILE_SOURCE_REFERENCE:
      "acx-audio-submission-requirements-reviewed-2026-07",
    STORYTELLER_AUDIO_ENGINEERING_TIMEOUT_MS: "30000",
    STORYTELLER_AUDIO_ENGINEERING_MAX_OUTPUT_BYTES: String(2 * 1024 * 1024),
    FFPROBE_PATH: "/private/tools/ffprobe",
    FFMPEG_PATH: "/private/tools/ffmpeg",
  };
}

test("disabled worker ignores every audio engineering setting", () => {
  const policy = resolveWorkerAudioEngineeringPolicy({
    workerEnabled: false,
    environment: {
      STORYTELLER_AUDIO_ENGINEERING_PROFILE: "invalid",
      STORYTELLER_AUDIO_ENGINEERING_PROFILE_VERSION: "",
      STORYTELLER_AUDIO_ENGINEERING_PROFILE_REVIEWED_AT: "not-a-date",
      FFMPEG_PATH: "unsafe\npath",
    },
  });
  assert.equal(policy, null);
  assert.deepEqual(workerAudioEngineeringPolicySummary(policy), { enabled: false });
});

test("enabled worker resolves one reviewed profile with bounded private tools", () => {
  const policy = resolveWorkerAudioEngineeringPolicy({
    workerEnabled: true,
    environment: environment(),
    temporaryRoot: "/private/storyteller/engineering-temp",
    runner: new FixtureRunner(),
    now: t0,
  });
  if (!policy) throw new Error("audio engineering policy required");
  assert.equal(policy.profile.profile.id, "acx-audiobook");
  assert.equal(policy.profile.externalVersion, "acx-2026-07");
  assert.equal(policy.timeoutMs, 30_000);
  assert.equal(policy.maximumOutputBytes, 2 * 1024 * 1024);

  const summary = workerAudioEngineeringPolicySummary(policy);
  assert.equal(summary.enabled, true);
  assert.equal(summary.profile?.profileId, "acx-audiobook");
  assert.equal(summary.profile?.runnerConfigured, true);
  const serialised = JSON.stringify(summary);
  for (const forbidden of [
    "/private/storyteller/engineering-temp",
    "/private/tools/ffprobe",
    "/private/tools/ffmpeg",
    "acx-audio-submission-requirements-reviewed-2026-07",
  ]) assert.equal(serialised.includes(forbidden), false);
});

test("enabled worker requires an explicit reviewed profile and private temporary root", () => {
  for (const [missing, code] of [
    ["STORYTELLER_AUDIO_ENGINEERING_PROFILE", "WORKER_AUDIO_ENGINEERING_PROFILE_INVALID"],
    ["STORYTELLER_AUDIO_ENGINEERING_PROFILE_VERSION", "WORKER_AUDIO_ENGINEERING_PROFILE_VERSION_REQUIRED"],
    ["STORYTELLER_AUDIO_ENGINEERING_PROFILE_REVIEWED_AT", "WORKER_AUDIO_ENGINEERING_PROFILE_REVIEWED_AT_REQUIRED"],
    ["STORYTELLER_AUDIO_ENGINEERING_PROFILE_SOURCE_REFERENCE", "WORKER_AUDIO_ENGINEERING_PROFILE_SOURCE_REQUIRED"],
  ] as const) {
    const value = environment();
    delete value[missing];
    assert.throws(
      () => resolveWorkerAudioEngineeringPolicy({
        workerEnabled: true,
        environment: value,
        temporaryRoot: "/private/temp",
        now: t0,
      }),
      new RegExp(code, "u"),
    );
  }
  assert.throws(
    () => resolveWorkerAudioEngineeringPolicy({
      workerEnabled: true,
      environment: environment(),
      now: t0,
    }),
    /WORKER_AUDIO_ENGINEERING_TEMP_ROOT_REQUIRED/u,
  );
});

test("unknown profiles, future review, unsafe paths and unbounded controls fail closed", () => {
  assert.throws(
    () => resolveWorkerAudioEngineeringPolicy({
      workerEnabled: true,
      environment: {
        ...environment(),
        STORYTELLER_AUDIO_ENGINEERING_PROFILE: "generic-naturalness",
      },
      temporaryRoot: "/private/temp",
      now: t0,
    }),
    /WORKER_AUDIO_ENGINEERING_PROFILE_INVALID/u,
  );
  assert.throws(
    () => resolveWorkerAudioEngineeringPolicy({
      workerEnabled: true,
      environment: {
        ...environment(),
        STORYTELLER_AUDIO_ENGINEERING_PROFILE_REVIEWED_AT: "2026-07-28T00:00:00.000Z",
      },
      temporaryRoot: "/private/temp",
      now: t0,
    }),
    /AUDIO_ENGINEERING_PROFILE_REVIEW_IN_FUTURE/u,
  );
  assert.throws(
    () => resolveWorkerAudioEngineeringPolicy({
      workerEnabled: true,
      environment: {
        ...environment(),
        FFPROBE_PATH: "ffprobe\n--unsafe",
      },
      temporaryRoot: "/private/temp",
      now: t0,
    }),
    /GENERATION_AUDIO_ENGINEERING_FFPROBE_PATH_INVALID/u,
  );
  assert.throws(
    () => resolveWorkerAudioEngineeringPolicy({
      workerEnabled: true,
      environment: {
        ...environment(),
        STORYTELLER_AUDIO_ENGINEERING_TIMEOUT_MS: "999999999",
      },
      temporaryRoot: "/private/temp",
      now: t0,
    }),
    /WORKER_AUDIO_ENGINEERING_TIMEOUT_INVALID/u,
  );
  assert.throws(
    () => resolveWorkerAudioEngineeringPolicy({
      workerEnabled: true,
      environment: {
        ...environment(),
        STORYTELLER_AUDIO_ENGINEERING_MAX_OUTPUT_BYTES: "0",
      },
      temporaryRoot: "/private/temp",
      now: t0,
    }),
    /WORKER_AUDIO_ENGINEERING_OUTPUT_LIMIT_INVALID/u,
  );
});

test("lossless production profile is an explicit alternative rather than an implicit fallback", () => {
  const policy = resolveWorkerAudioEngineeringPolicy({
    workerEnabled: true,
    environment: {
      ...environment(),
      STORYTELLER_AUDIO_ENGINEERING_PROFILE: "lossless-production",
      STORYTELLER_AUDIO_ENGINEERING_PROFILE_VERSION: "evavo-lossless-2026-07",
      STORYTELLER_AUDIO_ENGINEERING_PROFILE_SOURCE_REFERENCE:
        "evavo-lossless-mastering-policy-2026-07",
    },
    temporaryRoot: "/private/temp",
    now: t0,
  });
  assert.equal(policy?.profile.profile.id, "lossless-production");
});
