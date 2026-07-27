import { spawn } from "node:child_process";
import { basename } from "node:path";
import {
  assessTechnicalAudio,
  stableHash,
  type AudioMetrics,
  type DeliveryProfile,
  type Finding,
  type TechnicalAssessment,
} from "./index.js";

export const AUDIO_ENGINEERING_SCHEMA_VERSION = "storyteller-audio-engineering-v1" as const;

export type AudioEngineeringStage =
  | "ffprobe-version"
  | "ffmpeg-version"
  | "probe"
  | "astats"
  | "loudnorm"
  | "silence";

export interface AudioEngineeringCommand {
  stage: AudioEngineeringStage;
  executable: string;
  args: readonly string[];
  timeoutMs: number;
  maximumOutputBytes: number;
}

export interface AudioEngineeringCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface AudioEngineeringRunner {
  run(
    command: AudioEngineeringCommand,
    signal?: AbortSignal,
  ): Promise<AudioEngineeringCommandResult>;
}

export interface AudioProbeObservation {
  formatName: string;
  codecName: string;
  durationSeconds: number;
  sampleRateHz: number;
  bitRateKbps?: number;
  channels: number;
  observedByteCount: number;
}

export interface AudioAstatsObservation {
  rmsDb: number;
  peakDb: number;
  noiseFloorDb: number;
  peakCount: number;
  clippedSampleCount: number;
}

export interface AudioLoudnessObservation {
  integratedLufs: number;
  loudnessRangeLu: number;
  truePeakDb: number;
  thresholdLufs: number;
  targetOffsetLu: number;
}

export interface AudioSilenceObservation {
  leadingSilenceMs: number;
  trailingSilenceMs: number;
  intervalCount: number;
}

export interface AudioEngineeringProfileSnapshot {
  profile: DeliveryProfile;
  externalVersion: string;
  reviewedAt: string;
  sourceReference: string;
  fingerprint: string;
}

export interface AudioEngineeringToolEvidence {
  executableName: string;
  versionLine: string;
  versionFingerprint: string;
}

export interface AudioEngineeringEvidence {
  schemaVersion: typeof AUDIO_ENGINEERING_SCHEMA_VERSION;
  id: string;
  inputContentHash: string;
  inputByteCount: number;
  measuredAt: string;
  profile: AudioEngineeringProfileSnapshot;
  tools: Readonly<{
    ffprobe: AudioEngineeringToolEvidence;
    ffmpeg: AudioEngineeringToolEvidence;
  }>;
  commandFingerprints: Readonly<Record<AudioEngineeringStage, string>>;
  probe: AudioProbeObservation;
  astats: AudioAstatsObservation;
  loudness: AudioLoudnessObservation;
  silence: AudioSilenceObservation;
  metrics: AudioMetrics;
  technical: TechnicalAssessment;
  eligible: boolean;
  findings: readonly Finding[];
  fingerprint: string;
}

export interface AudioEngineeringPublicView {
  id: string;
  inputContentHash: string;
  inputByteCount: number;
  measuredAt: string;
  profileId: string;
  profileVersion: string;
  profileFingerprint: string;
  formatName: string;
  codecName: string;
  durationSeconds: number;
  metrics: AudioMetrics;
  integratedLufs: number;
  loudnessRangeLu: number;
  eligible: boolean;
  findingCodes: readonly string[];
  evidenceFingerprint: string;
}

export interface AnalyseAudioEngineeringInput {
  audioPath: string;
  inputContentHash: string;
  inputByteCount: number;
  profile: DeliveryProfile;
  profileVersion: string;
  profileReviewedAt: string;
  profileSourceReference: string;
  runner?: AudioEngineeringRunner;
  ffprobePath?: string;
  ffmpegPath?: string;
  timeoutMs?: number;
  maximumOutputBytes?: number;
  now?: Date;
  signal?: AbortSignal;
}

export class AudioEngineeringError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "AudioEngineeringError";
    this.code = code;
  }
}

const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const SAFE_VERSION = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAXIMUM_OUTPUT_BYTES = 8 * 1024 * 1024;
const MAXIMUM_OUTPUT_BYTES = 64 * 1024 * 1024;

function requireFinite(
  value: number,
  minimum: number,
  maximum: number,
  code: string,
): number {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new AudioEngineeringError(code);
  }
  return value;
}

function requireInteger(
  value: number,
  minimum: number,
  maximum: number,
  code: string,
): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new AudioEngineeringError(code);
  }
  return value;
}

function requireDate(value: string, code: string): string {
  if (!value || Number.isNaN(Date.parse(value))) throw new AudioEngineeringError(code);
  return value;
}

function requireBoundedText(value: string, maximum: number, code: string): string {
  if (
    typeof value !== "string"
    || value.trim().length === 0
    || value.length > maximum
    || CONTROL_CHARACTERS.test(value)
    || /[\r\n]/u.test(value)
  ) {
    throw new AudioEngineeringError(code);
  }
  return value;
}

function parseNumeric(value: unknown, code: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new AudioEngineeringError(code);
  return parsed;
}

function parsePositiveInteger(value: unknown, code: string): number {
  const parsed = parseNumeric(value, code);
  return requireInteger(Math.round(parsed), 1, Number.MAX_SAFE_INTEGER, code);
}

function freezeProfile(profile: DeliveryProfile): DeliveryProfile {
  return Object.freeze({
    ...profile,
    notes: Object.freeze([...profile.notes]),
  });
}

function profileSnapshotBase(
  snapshot: Omit<AudioEngineeringProfileSnapshot, "fingerprint">,
): Readonly<Record<string, unknown>> {
  return {
    profile: snapshot.profile,
    externalVersion: snapshot.externalVersion,
    reviewedAt: snapshot.reviewedAt,
    sourceReference: snapshot.sourceReference,
  };
}

export function createAudioEngineeringProfileSnapshot(input: Readonly<{
  profile: DeliveryProfile;
  externalVersion: string;
  reviewedAt: string;
  sourceReference: string;
  now?: Date;
}>): AudioEngineeringProfileSnapshot {
  const now = input.now ?? new Date();
  if (Number.isNaN(now.getTime())) throw new AudioEngineeringError("AUDIO_ENGINEERING_NOW_INVALID");
  const profile = freezeProfile(input.profile);
  requireBoundedText(profile.id, 128, "AUDIO_ENGINEERING_PROFILE_ID_INVALID");
  requireBoundedText(profile.label, 300, "AUDIO_ENGINEERING_PROFILE_LABEL_INVALID");
  requireFinite(profile.rmsDbMin, -200, 20, "AUDIO_ENGINEERING_PROFILE_RMS_MIN_INVALID");
  requireFinite(profile.rmsDbMax, -200, 20, "AUDIO_ENGINEERING_PROFILE_RMS_MAX_INVALID");
  if (profile.rmsDbMin > profile.rmsDbMax) {
    throw new AudioEngineeringError("AUDIO_ENGINEERING_PROFILE_RMS_ORDER_INVALID");
  }
  requireFinite(profile.peakDbMax, -200, 20, "AUDIO_ENGINEERING_PROFILE_PEAK_INVALID");
  if (profile.truePeakDbMax !== undefined) {
    requireFinite(profile.truePeakDbMax, -200, 20, "AUDIO_ENGINEERING_PROFILE_TRUE_PEAK_INVALID");
  }
  requireFinite(profile.noiseFloorDbMax, -200, 20, "AUDIO_ENGINEERING_PROFILE_NOISE_INVALID");
  requireInteger(profile.minimumSampleRateHz, 8_000, 768_000, "AUDIO_ENGINEERING_PROFILE_SAMPLE_RATE_INVALID");
  if (profile.minimumBitRateKbps !== undefined) {
    requireInteger(profile.minimumBitRateKbps, 1, 100_000, "AUDIO_ENGINEERING_PROFILE_BIT_RATE_INVALID");
  }
  if (profile.channels !== 1 && profile.channels !== 2) {
    throw new AudioEngineeringError("AUDIO_ENGINEERING_PROFILE_CHANNELS_INVALID");
  }
  if (!SAFE_VERSION.test(input.externalVersion)) {
    throw new AudioEngineeringError("AUDIO_ENGINEERING_PROFILE_VERSION_INVALID");
  }
  const reviewedAt = requireDate(input.reviewedAt, "AUDIO_ENGINEERING_PROFILE_REVIEWED_AT_INVALID");
  if (Date.parse(reviewedAt) > now.getTime()) {
    throw new AudioEngineeringError("AUDIO_ENGINEERING_PROFILE_REVIEW_IN_FUTURE");
  }
  const sourceReference = requireBoundedText(
    input.sourceReference,
    500,
    "AUDIO_ENGINEERING_PROFILE_SOURCE_INVALID",
  );
  const base = {
    profile,
    externalVersion: input.externalVersion,
    reviewedAt,
    sourceReference,
  };
  return Object.freeze({
    ...base,
    fingerprint: stableHash(profileSnapshotBase(base)),
  });
}

function safeExecutableName(value: string): string {
  const name = basename(value.trim());
  if (!name || name.length > 200 || CONTROL_CHARACTERS.test(name)) {
    throw new AudioEngineeringError("AUDIO_ENGINEERING_EXECUTABLE_INVALID");
  }
  return name;
}

function commandFingerprint(
  command: AudioEngineeringCommand,
  privateAudioPath: string,
): string {
  const safeArguments = command.args.map((argument) =>
    privateAudioPath && argument.includes(privateAudioPath)
      ? argument.replaceAll(privateAudioPath, "<private-audio>")
      : argument
  );
  return stableHash({
    stage: command.stage,
    executableName: safeExecutableName(command.executable),
    args: safeArguments,
    timeoutMs: command.timeoutMs,
    maximumOutputBytes: command.maximumOutputBytes,
  });
}

function validateCommand(command: AudioEngineeringCommand): void {
  safeExecutableName(command.executable);
  if (!Array.isArray(command.args) || command.args.length > 128) {
    throw new AudioEngineeringError("AUDIO_ENGINEERING_ARGUMENTS_INVALID");
  }
  for (const argument of command.args) {
    if (
      typeof argument !== "string"
      || argument.length > 8_000
      || argument.includes("\0")
    ) {
      throw new AudioEngineeringError("AUDIO_ENGINEERING_ARGUMENT_INVALID");
    }
  }
  requireInteger(command.timeoutMs, 10, 15 * 60_000, "AUDIO_ENGINEERING_TIMEOUT_INVALID");
  requireInteger(
    command.maximumOutputBytes,
    1,
    MAXIMUM_OUTPUT_BYTES,
    "AUDIO_ENGINEERING_OUTPUT_LIMIT_INVALID",
  );
}

export class NodeAudioEngineeringRunner implements AudioEngineeringRunner {
  async run(
    command: AudioEngineeringCommand,
    signal?: AbortSignal,
  ): Promise<AudioEngineeringCommandResult> {
    validateCommand(command);
    if (signal?.aborted) throw new AudioEngineeringError("AUDIO_ENGINEERING_ABORTED");
    const startedAt = Date.now();
    return await new Promise<AudioEngineeringCommandResult>((resolvePromise, rejectPromise) => {
      let settled = false;
      let timedOut = false;
      let exceeded = false;
      let aborted = false;
      let totalBytes = 0;
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      const child = spawn(command.executable, [...command.args], {
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });

      const settleReject = (code: string): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        rejectPromise(new AudioEngineeringError(code));
      };
      const onAbort = (): void => {
        aborted = true;
        child.kill("SIGKILL");
      };
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, command.timeoutMs);
      const collect = (target: Buffer[], chunk: Buffer | string): void => {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        totalBytes += bytes.byteLength;
        if (totalBytes > command.maximumOutputBytes) {
          exceeded = true;
          child.kill("SIGKILL");
          return;
        }
        target.push(bytes);
      };

      signal?.addEventListener("abort", onAbort, { once: true });
      child.stdout?.on("data", (chunk: Buffer | string) => collect(stdout, chunk));
      child.stderr?.on("data", (chunk: Buffer | string) => collect(stderr, chunk));
      child.once("error", () => settleReject("AUDIO_ENGINEERING_EXECUTABLE_UNAVAILABLE"));
      child.once("close", (exitCode) => {
        if (settled) return;
        if (aborted) return settleReject("AUDIO_ENGINEERING_ABORTED");
        if (timedOut) return settleReject("AUDIO_ENGINEERING_COMMAND_TIMEOUT");
        if (exceeded) return settleReject("AUDIO_ENGINEERING_COMMAND_OUTPUT_TOO_LARGE");
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        resolvePromise(Object.freeze({
          exitCode: exitCode ?? -1,
          stdout: Buffer.concat(stdout).toString("utf8"),
          stderr: Buffer.concat(stderr).toString("utf8"),
          durationMs: Math.max(0, Date.now() - startedAt),
        }));
      });
    });
  }
}

function parseJsonObject(source: string, code: string): Record<string, unknown> {
  try {
    const value = JSON.parse(source) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new AudioEngineeringError(code);
    }
    return value as Record<string, unknown>;
  } catch (error) {
    if (error instanceof AudioEngineeringError) throw error;
    throw new AudioEngineeringError(code);
  }
}

export function parseFfprobeAudio(source: string): AudioProbeObservation {
  const payload = parseJsonObject(source, "AUDIO_ENGINEERING_FFPROBE_JSON_INVALID");
  const streams = Array.isArray(payload.streams) ? payload.streams : [];
  const audio = streams.find((value) =>
    value && typeof value === "object" && !Array.isArray(value)
    && (value as Record<string, unknown>).codec_type === "audio"
  ) as Record<string, unknown> | undefined;
  const format = payload.format && typeof payload.format === "object" && !Array.isArray(payload.format)
    ? payload.format as Record<string, unknown>
    : undefined;
  if (!audio || !format) throw new AudioEngineeringError("AUDIO_ENGINEERING_FFPROBE_AUDIO_MISSING");

  const sampleRateHz = parsePositiveInteger(
    audio.sample_rate,
    "AUDIO_ENGINEERING_FFPROBE_SAMPLE_RATE_INVALID",
  );
  const channels = parsePositiveInteger(
    audio.channels,
    "AUDIO_ENGINEERING_FFPROBE_CHANNELS_INVALID",
  );
  const durationSeconds = requireFinite(
    parseNumeric(audio.duration ?? format.duration, "AUDIO_ENGINEERING_FFPROBE_DURATION_INVALID"),
    0.001,
    7 * 24 * 60 * 60,
    "AUDIO_ENGINEERING_FFPROBE_DURATION_INVALID",
  );
  const observedByteCount = parsePositiveInteger(
    format.size,
    "AUDIO_ENGINEERING_FFPROBE_SIZE_INVALID",
  );
  const rawBitRate = audio.bit_rate ?? format.bit_rate;
  const bitRateKbps = rawBitRate === undefined
    ? undefined
    : Number((parseNumeric(rawBitRate, "AUDIO_ENGINEERING_FFPROBE_BIT_RATE_INVALID") / 1_000).toFixed(3));
  if (bitRateKbps !== undefined) {
    requireFinite(bitRateKbps, 0.001, 1_000_000, "AUDIO_ENGINEERING_FFPROBE_BIT_RATE_INVALID");
  }
  const formatName = requireBoundedText(
    String(format.format_name ?? ""),
    200,
    "AUDIO_ENGINEERING_FFPROBE_FORMAT_INVALID",
  );
  const codecName = requireBoundedText(
    String(audio.codec_name ?? ""),
    200,
    "AUDIO_ENGINEERING_FFPROBE_CODEC_INVALID",
  );
  return Object.freeze({
    formatName,
    codecName,
    durationSeconds: Number(durationSeconds.toFixed(6)),
    sampleRateHz,
    ...(bitRateKbps !== undefined ? { bitRateKbps } : {}),
    channels,
    observedByteCount,
  });
}

function metricPattern(label: string): RegExp {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&").replaceAll("_", "[_ ]");
  return new RegExp(`(?:lavfi\\.astats\\.Overall\\.)?${escaped}(?:\\s+dB)?\\s*[:=]\\s*(-?(?:\\d+(?:\\.\\d+)?|inf|nan))`, "iu");
}

function extractMetric(source: string, labels: readonly string[], code: string): number {
  for (const label of labels) {
    const match = source.match(metricPattern(label));
    const raw = match?.[1]?.toLocaleLowerCase("en-AU");
    if (!raw) continue;
    if (raw === "-inf") return -120;
    if (raw === "inf" || raw === "nan") throw new AudioEngineeringError(code);
    return requireFinite(Number(raw), -500, 500_000_000, code);
  }
  throw new AudioEngineeringError(code);
}

export function parseAstatsAudio(source: string): AudioAstatsObservation {
  const rmsDb = extractMetric(source, ["RMS_level", "RMS level"], "AUDIO_ENGINEERING_Astats_RMS_MISSING");
  const peakDb = extractMetric(source, ["Peak_level", "Peak level"], "AUDIO_ENGINEERING_Astats_PEAK_MISSING");
  const noiseFloorDb = extractMetric(
    source,
    ["Noise_floor", "Noise floor"],
    "AUDIO_ENGINEERING_Astats_NOISE_MISSING",
  );
  let peakCount = 0;
  try {
    peakCount = Math.max(0, Math.round(extractMetric(
      source,
      ["Peak_count", "Peak count"],
      "AUDIO_ENGINEERING_Astats_PEAK_COUNT_MISSING",
    )));
  } catch (error) {
    if (!(error instanceof AudioEngineeringError)) throw error;
  }
  return Object.freeze({
    rmsDb: Number(rmsDb.toFixed(4)),
    peakDb: Number(peakDb.toFixed(4)),
    noiseFloorDb: Number(noiseFloorDb.toFixed(4)),
    peakCount,
    clippedSampleCount: peakDb >= -0.0001 ? Math.max(1, peakCount) : 0,
  });
}

function loudnormPayload(source: string): Record<string, unknown> {
  const candidates = [...source.matchAll(/\{[^{}]*"input_i"[^{}]*\}/gu)];
  const candidate = candidates.at(-1)?.[0];
  if (!candidate) throw new AudioEngineeringError("AUDIO_ENGINEERING_LOUDNORM_JSON_MISSING");
  return parseJsonObject(candidate, "AUDIO_ENGINEERING_LOUDNORM_JSON_INVALID");
}

export function parseLoudnormAudio(source: string): AudioLoudnessObservation {
  const payload = loudnormPayload(source);
  return Object.freeze({
    integratedLufs: Number(parseNumeric(payload.input_i, "AUDIO_ENGINEERING_LOUDNORM_I_INVALID").toFixed(4)),
    loudnessRangeLu: Number(parseNumeric(payload.input_lra, "AUDIO_ENGINEERING_LOUDNORM_LRA_INVALID").toFixed(4)),
    truePeakDb: Number(parseNumeric(payload.input_tp, "AUDIO_ENGINEERING_LOUDNORM_TP_INVALID").toFixed(4)),
    thresholdLufs: Number(parseNumeric(payload.input_thresh, "AUDIO_ENGINEERING_LOUDNORM_THRESHOLD_INVALID").toFixed(4)),
    targetOffsetLu: Number(parseNumeric(payload.target_offset, "AUDIO_ENGINEERING_LOUDNORM_OFFSET_INVALID").toFixed(4)),
  });
}

export function parseSilenceDetect(
  source: string,
  durationSeconds: number,
): AudioSilenceObservation {
  requireFinite(durationSeconds, 0.001, 7 * 24 * 60 * 60, "AUDIO_ENGINEERING_SILENCE_DURATION_INVALID");
  const intervals: Array<{ start: number; end: number }> = [];
  let openStart: number | undefined;
  const eventPattern = /silence_(start|end):\s*([0-9]+(?:\.[0-9]+)?)(?:\s*\|\s*silence_duration:\s*([0-9]+(?:\.[0-9]+)?))?/gu;
  const events = [...source.matchAll(eventPattern)];
if (events.length === 0 && /silence_(?:start|end)\s*:/u.test(source)) {
  throw new AudioEngineeringError("AUDIO_ENGINEERING_SILENCE_EVENT_INVALID");
}
  for (const match of events) {
    const kind = match[1];
    const value = Number(match[2]);
    if (!Number.isFinite(value) || value < 0) {
      throw new AudioEngineeringError("AUDIO_ENGINEERING_SILENCE_EVENT_INVALID");
    }
    if (kind === "start") {
      openStart = value;
      continue;
    }
    const duration = match[3] === undefined ? undefined : Number(match[3]);
    const start = openStart ?? (duration === undefined ? value : Math.max(0, value - duration));
    intervals.push({ start, end: Math.min(durationSeconds, value) });
    openStart = undefined;
  }
  if (openStart !== undefined && openStart < durationSeconds) {
    intervals.push({ start: openStart, end: durationSeconds });
  }
  intervals.sort((left, right) => left.start - right.start || left.end - right.end);
  const leading = intervals.find((interval) => interval.start <= 0.05);
  const trailing = [...intervals].reverse().find((interval) => interval.end >= durationSeconds - 0.05);
  return Object.freeze({
    leadingSilenceMs: leading ? Math.max(0, Math.round(leading.end * 1_000)) : 0,
    trailingSilenceMs: trailing
      ? Math.max(0, Math.round((durationSeconds - trailing.start) * 1_000))
      : 0,
    intervalCount: intervals.length,
  });
}

function versionEvidence(executable: string, output: string): AudioEngineeringToolEvidence {
  const line = output.split(/\r?\n/u).map((value) => value.trim()).find(Boolean);
  if (!line || line.length > 500 || CONTROL_CHARACTERS.test(line)) {
    throw new AudioEngineeringError("AUDIO_ENGINEERING_TOOL_VERSION_INVALID");
  }
  return Object.freeze({
    executableName: safeExecutableName(executable),
    versionLine: line,
    versionFingerprint: stableHash(line),
  });
}

async function executeStage(
  runner: AudioEngineeringRunner,
  command: AudioEngineeringCommand,
  signal?: AbortSignal,
): Promise<AudioEngineeringCommandResult> {
  try {
    const result = await runner.run(command, signal);
    if (!Number.isSafeInteger(result.exitCode) || result.exitCode !== 0) {
      throw new AudioEngineeringError(`AUDIO_ENGINEERING_COMMAND_EXIT_NONZERO:${command.stage}`);
    }
    if (
      typeof result.stdout !== "string"
      || typeof result.stderr !== "string"
      || !Number.isFinite(result.durationMs)
      || result.durationMs < 0
    ) {
      throw new AudioEngineeringError(`AUDIO_ENGINEERING_COMMAND_RESULT_INVALID:${command.stage}`);
    }
    return result;
  } catch (error) {
    if (error instanceof AudioEngineeringError) {
      if (error.code.includes(":")) throw error;
      throw new AudioEngineeringError(`${error.code}:${command.stage}`);
    }
    throw new AudioEngineeringError(`AUDIO_ENGINEERING_COMMAND_FAILED:${command.stage}`);
  }
}

function evidenceBase(
  evidence: Omit<AudioEngineeringEvidence, "fingerprint">,
): Readonly<Record<string, unknown>> {
  return {
    ...evidence,
    findings: [...evidence.findings],
  };
}

function validateInput(input: AnalyseAudioEngineeringInput): Readonly<{
  now: Date;
  timeoutMs: number;
  maximumOutputBytes: number;
}> {
  if (!input.audioPath.trim() || input.audioPath.includes("\0")) {
    throw new AudioEngineeringError("AUDIO_ENGINEERING_PRIVATE_PATH_REQUIRED");
  }
  if (!HASH_PATTERN.test(input.inputContentHash)) {
    throw new AudioEngineeringError("AUDIO_ENGINEERING_INPUT_HASH_INVALID");
  }
  requireInteger(input.inputByteCount, 1, Number.MAX_SAFE_INTEGER, "AUDIO_ENGINEERING_INPUT_SIZE_INVALID");
  const now = input.now ?? new Date();
  if (Number.isNaN(now.getTime())) throw new AudioEngineeringError("AUDIO_ENGINEERING_NOW_INVALID");
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maximumOutputBytes = input.maximumOutputBytes ?? DEFAULT_MAXIMUM_OUTPUT_BYTES;
  requireInteger(timeoutMs, 10, 15 * 60_000, "AUDIO_ENGINEERING_TIMEOUT_INVALID");
  requireInteger(
    maximumOutputBytes,
    1,
    MAXIMUM_OUTPUT_BYTES,
    "AUDIO_ENGINEERING_OUTPUT_LIMIT_INVALID",
  );
  return { now, timeoutMs, maximumOutputBytes };
}

export async function analyseAudioEngineering(
  input: AnalyseAudioEngineeringInput,
): Promise<AudioEngineeringEvidence> {
  const validated = validateInput(input);
  const profile = createAudioEngineeringProfileSnapshot({
    profile: input.profile,
    externalVersion: input.profileVersion,
    reviewedAt: input.profileReviewedAt,
    sourceReference: input.profileSourceReference,
    now: validated.now,
  });
  const runner = input.runner ?? new NodeAudioEngineeringRunner();
  const ffprobe = input.ffprobePath?.trim() || "ffprobe";
  const ffmpeg = input.ffmpegPath?.trim() || "ffmpeg";
  const common = {
    timeoutMs: validated.timeoutMs,
    maximumOutputBytes: validated.maximumOutputBytes,
  };
  const commands: Record<AudioEngineeringStage, AudioEngineeringCommand> = {
    "ffprobe-version": {
      stage: "ffprobe-version",
      executable: ffprobe,
      args: ["-version"],
      ...common,
    },
    "ffmpeg-version": {
      stage: "ffmpeg-version",
      executable: ffmpeg,
      args: ["-version"],
      ...common,
    },
    probe: {
      stage: "probe",
      executable: ffprobe,
      args: [
        "-v", "error",
        "-show_entries",
        "format=format_name,duration,bit_rate,size:stream=codec_type,codec_name,sample_rate,channels,bit_rate,duration",
        "-of", "json",
        input.audioPath,
      ],
      ...common,
    },
    astats: {
      stage: "astats",
      executable: ffmpeg,
      args: [
        "-hide_banner", "-nostdin", "-v", "info",
        "-i", input.audioPath,
        "-map", "0:a:0",
        "-af", "astats=metadata=1:reset=0,ametadata=print:file=-",
        "-f", "null", "-",
      ],
      ...common,
    },
    loudnorm: {
      stage: "loudnorm",
      executable: ffmpeg,
      args: [
        "-hide_banner", "-nostdin", "-v", "info",
        "-i", input.audioPath,
        "-map", "0:a:0",
        "-af", `loudnorm=I=-20:LRA=7:TP=${input.profile.truePeakDbMax ?? input.profile.peakDbMax}:print_format=json`,
        "-f", "null", "-",
      ],
      ...common,
    },
    silence: {
      stage: "silence",
      executable: ffmpeg,
      args: [
        "-hide_banner", "-nostdin", "-v", "info",
        "-i", input.audioPath,
        "-map", "0:a:0",
        "-af", `silencedetect=noise=${input.profile.noiseFloorDbMax}dB:d=0.1`,
        "-f", "null", "-",
      ],
      ...common,
    },
  };

  for (const command of Object.values(commands)) validateCommand(command);
  const commandFingerprints = Object.freeze(Object.fromEntries(
    Object.entries(commands).map(([stage, command]) => [
      stage,
      commandFingerprint(command, input.audioPath),
    ]),
  ) as Record<AudioEngineeringStage, string>);

  const ffprobeVersion = await executeStage(runner, commands["ffprobe-version"], input.signal);
  const ffmpegVersion = await executeStage(runner, commands["ffmpeg-version"], input.signal);
  const probeResult = await executeStage(runner, commands.probe, input.signal);
  const probe = parseFfprobeAudio(`${probeResult.stdout}\n${probeResult.stderr}`.trim());
  const astatsResult = await executeStage(runner, commands.astats, input.signal);
  const astats = parseAstatsAudio(`${astatsResult.stdout}\n${astatsResult.stderr}`);
  const loudnormResult = await executeStage(runner, commands.loudnorm, input.signal);
  const loudness = parseLoudnormAudio(`${loudnormResult.stdout}\n${loudnormResult.stderr}`);
  const silenceResult = await executeStage(runner, commands.silence, input.signal);
  const silence = parseSilenceDetect(
    `${silenceResult.stdout}\n${silenceResult.stderr}`,
    probe.durationSeconds,
  );

  const metrics: AudioMetrics = Object.freeze({
    rmsDb: astats.rmsDb,
    peakDb: astats.peakDb,
    truePeakDb: loudness.truePeakDb,
    noiseFloorDb: astats.noiseFloorDb,
    sampleRateHz: probe.sampleRateHz,
    ...(probe.bitRateKbps !== undefined ? { bitRateKbps: probe.bitRateKbps } : {}),
    channels: probe.channels,
    clippedSampleCount: astats.clippedSampleCount,
    leadingSilenceMs: silence.leadingSilenceMs,
    trailingSilenceMs: silence.trailingSilenceMs,
  });
  const technical = Object.freeze(assessTechnicalAudio(metrics, profile.profile));
  const findings: Finding[] = [...technical.findings];
  if (probe.observedByteCount !== input.inputByteCount) {
    findings.unshift({
      code: "AUDIO_ENGINEERING_BYTE_COUNT_MISMATCH",
      severity: "error",
      message: "The independently probed media size does not match the governed input size.",
    });
  }
  const measuredAt = validated.now.toISOString();
  const id = `audioeng_${stableHash({
    inputContentHash: input.inputContentHash,
    profileFingerprint: profile.fingerprint,
    measuredAt,
  }).slice(0, 24)}`;
  const base: Omit<AudioEngineeringEvidence, "fingerprint"> = {
    schemaVersion: AUDIO_ENGINEERING_SCHEMA_VERSION,
    id,
    inputContentHash: input.inputContentHash,
    inputByteCount: input.inputByteCount,
    measuredAt,
    profile,
    tools: Object.freeze({
      ffprobe: versionEvidence(ffprobe, `${ffprobeVersion.stdout}\n${ffprobeVersion.stderr}`),
      ffmpeg: versionEvidence(ffmpeg, `${ffmpegVersion.stdout}\n${ffmpegVersion.stderr}`),
    }),
    commandFingerprints,
    probe,
    astats,
    loudness,
    silence,
    metrics,
    technical,
    eligible: !findings.some((finding) => finding.severity === "error"),
    findings: Object.freeze(findings),
  };
  const evidence = Object.freeze({
    ...base,
    fingerprint: stableHash(evidenceBase(base)),
  });
  assertAudioEngineeringEvidence(evidence);
  return evidence;
}

export function assertAudioEngineeringEvidence(evidence: AudioEngineeringEvidence): void {
  if (evidence.schemaVersion !== AUDIO_ENGINEERING_SCHEMA_VERSION) {
    throw new AudioEngineeringError("AUDIO_ENGINEERING_SCHEMA_UNSUPPORTED");
  }
  if (!/^audioeng_[a-f0-9]{24}$/u.test(evidence.id)) {
    throw new AudioEngineeringError("AUDIO_ENGINEERING_ID_INVALID");
  }
  if (!HASH_PATTERN.test(evidence.inputContentHash)) {
    throw new AudioEngineeringError("AUDIO_ENGINEERING_INPUT_HASH_INVALID");
  }
  requireInteger(evidence.inputByteCount, 1, Number.MAX_SAFE_INTEGER, "AUDIO_ENGINEERING_INPUT_SIZE_INVALID");
  requireDate(evidence.measuredAt, "AUDIO_ENGINEERING_MEASURED_AT_INVALID");
  const expectedProfile = createAudioEngineeringProfileSnapshot({
    profile: evidence.profile.profile,
    externalVersion: evidence.profile.externalVersion,
    reviewedAt: evidence.profile.reviewedAt,
    sourceReference: evidence.profile.sourceReference,
    now: new Date(evidence.measuredAt),
  });
  if (expectedProfile.fingerprint !== evidence.profile.fingerprint) {
    throw new AudioEngineeringError("AUDIO_ENGINEERING_PROFILE_FINGERPRINT_INVALID");
  }
  for (const stage of [
    "ffprobe-version",
    "ffmpeg-version",
    "probe",
    "astats",
    "loudnorm",
    "silence",
  ] as const) {
    if (!HASH_PATTERN.test(evidence.commandFingerprints[stage])) {
      throw new AudioEngineeringError("AUDIO_ENGINEERING_COMMAND_FINGERPRINT_INVALID");
    }
  }
  for (const tool of [evidence.tools.ffprobe, evidence.tools.ffmpeg]) {
    safeExecutableName(tool.executableName);
    requireBoundedText(tool.versionLine, 500, "AUDIO_ENGINEERING_TOOL_VERSION_INVALID");
    if (tool.versionFingerprint !== stableHash(tool.versionLine)) {
      throw new AudioEngineeringError("AUDIO_ENGINEERING_TOOL_FINGERPRINT_INVALID");
    }
  }
  const expectedTechnical = assessTechnicalAudio(evidence.metrics, evidence.profile.profile);
  if (stableHash(expectedTechnical) !== stableHash(evidence.technical)) {
    throw new AudioEngineeringError("AUDIO_ENGINEERING_TECHNICAL_ASSESSMENT_INVALID");
  }
  if (evidence.eligible === evidence.findings.some((finding) => finding.severity === "error")) {
    throw new AudioEngineeringError("AUDIO_ENGINEERING_ELIGIBILITY_INVALID");
  }
  const { fingerprint, ...base } = evidence;
  if (!HASH_PATTERN.test(fingerprint) || fingerprint !== stableHash(evidenceBase(base))) {
    throw new AudioEngineeringError("AUDIO_ENGINEERING_FINGERPRINT_INVALID");
  }
}

export function audioEngineeringPublicView(
  evidence: AudioEngineeringEvidence,
): AudioEngineeringPublicView {
  assertAudioEngineeringEvidence(evidence);
  return Object.freeze({
    id: evidence.id,
    inputContentHash: evidence.inputContentHash,
    inputByteCount: evidence.inputByteCount,
    measuredAt: evidence.measuredAt,
    profileId: evidence.profile.profile.id,
    profileVersion: evidence.profile.externalVersion,
    profileFingerprint: evidence.profile.fingerprint,
    formatName: evidence.probe.formatName,
    codecName: evidence.probe.codecName,
    durationSeconds: evidence.probe.durationSeconds,
    metrics: Object.freeze({ ...evidence.metrics }),
    integratedLufs: evidence.loudness.integratedLufs,
    loudnessRangeLu: evidence.loudness.loudnessRangeLu,
    eligible: evidence.eligible,
    findingCodes: Object.freeze(evidence.findings.map((finding) => finding.code)),
    evidenceFingerprint: evidence.fingerprint,
  });
}
