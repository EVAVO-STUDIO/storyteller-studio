import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import {
  assertAudiobookRetailTrackPlan,
  type AudiobookRetailTrack,
  type AudiobookRetailTrackOutput,
  type AudiobookRetailTrackPlan,
} from "./audiobook-retail-track-plan.js";
import { stableHash } from "./index.js";
import { detectArtifactMedia } from "./private-object-store.js";

export const AUDIOBOOK_RETAIL_TRACK_RENDER_SCHEMA_VERSION =
  "storyteller-audiobook-retail-track-render-v1" as const;

export interface ResolvedAudiobookRetailReferenceMaster {
  artifactId: string;
  artifactRevision: number;
  artifactFingerprint: string;
  privatePath: string;
  contentHash: string;
  byteCount: number;
  dispose(): Promise<void>;
}

export interface AudiobookRetailReferenceMasterResolver {
  resolve(
    snapshot: AudiobookRetailTrackPlan["referenceMaster"],
    signal?: AbortSignal,
  ): Promise<ResolvedAudiobookRetailReferenceMaster>;
}

export interface AudiobookRetailTrackRenderRequest {
  sourcePath: string;
  sourceStartMs: number;
  durationMs: number;
  filterScript: string;
  output: AudiobookRetailTrackOutput;
  timeoutMs: number;
  maximumOutputBytes: number;
}

export interface AudiobookRetailTrackRenderRunner {
  inspectVersion(signal?: AbortSignal): Promise<string>;
  render(
    request: AudiobookRetailTrackRenderRequest,
    signal?: AbortSignal,
  ): Promise<Uint8Array>;
}

export interface AudiobookRetailRenderedTrackOutput {
  format: "mp3";
  codec: "mp3";
  encoder: "libmp3lame";
  bitRateMode: "cbr";
  bitRateKbps: AudiobookRetailTrackOutput["bitRateKbps"];
  sampleRateHz: 44_100;
  channels: 1 | 2;
  contentHash: string;
  byteCount: number;
  mediaSignature: "mpeg-audio";
}

export interface AudiobookRetailRenderedTrackEvidence {
  ordinal: number;
  role: AudiobookRetailTrack["role"];
  fileName: string;
  trackFingerprint: string;
  sourceStartMs: number;
  sourceEndMs: number;
  expectedDurationMs: number;
  output: AudiobookRetailRenderedTrackOutput;
  filterFingerprint: string;
  commandFingerprint: string;
  fingerprint: string;
}

export interface AudiobookRetailTrackRenderEvidence {
  schemaVersion: typeof AUDIOBOOK_RETAIL_TRACK_RENDER_SCHEMA_VERSION;
  id: string;
  planId: string;
  planFingerprint: string;
  referenceMaster: Readonly<{
    artifactId: string;
    artifactRevision: number;
    artifactFingerprint: string;
    contentHash: string;
    byteCount: number;
  }>;
  tracks: readonly AudiobookRetailRenderedTrackEvidence[];
  tool: Readonly<{
    executableName: string;
    versionLine: string;
    versionFingerprint: string;
  }>;
  renderedAt: string;
  fingerprint: string;
}

export interface AudiobookRetailRenderedTrack {
  fileName: string;
  bytes: Uint8Array;
}

export interface AudiobookRetailTrackRenderResult {
  evidence: AudiobookRetailTrackRenderEvidence;
  tracks: readonly AudiobookRetailRenderedTrack[];
}

export interface AudiobookRetailTrackRenderPublicTrack {
  ordinal: number;
  role: AudiobookRetailTrack["role"];
  fileName: string;
  expectedDurationMs: number;
  output: AudiobookRetailRenderedTrackOutput;
}

export interface AudiobookRetailTrackRenderPublicView {
  id: string;
  planId: string;
  planFingerprint: string;
  trackCount: number;
  totalOutputBytes: number;
  tracks: readonly AudiobookRetailTrackRenderPublicTrack[];
  toolVersionFingerprint: string;
  renderedAt: string;
  fingerprint: string;
}

export interface RenderAudiobookRetailTrackPlanInput {
  plan: AudiobookRetailTrackPlan;
  referenceMaster: AudiobookRetailReferenceMasterResolver;
  runner?: AudiobookRetailTrackRenderRunner;
  ffmpegPath?: string;
  temporaryRoot?: string;
  timeoutMs?: number;
  maximumTrackOutputBytes?: number;
  maximumTotalOutputBytes?: number;
  renderedAt?: Date;
  signal?: AbortSignal;
}

export class AudiobookRetailTrackRenderError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "AudiobookRetailTrackRenderError";
    this.code = code;
  }
}

const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;
const FILE_NAME_PATTERN = /^[A-Za-z0-9]+\.mp3$/u;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const DEFAULT_TIMEOUT_MS = 60 * 60_000;
const MAXIMUM_TIMEOUT_MS = 4 * 60 * 60_000;
const DEFAULT_MAXIMUM_TRACK_OUTPUT_BYTES = 512 * 1024 * 1024;
const ABSOLUTE_MAXIMUM_TRACK_OUTPUT_BYTES = 1024 * 1024 * 1024;
const DEFAULT_MAXIMUM_TOTAL_OUTPUT_BYTES = 1024 * 1024 * 1024;
const ABSOLUTE_MAXIMUM_TOTAL_OUTPUT_BYTES = 4 * 1024 * 1024 * 1024;
const PROCESS_OUTPUT_LIMIT_BYTES = 8 * 1024 * 1024;
const MP3_ESTIMATE_OVERHEAD_BYTES = 2 * 1024 * 1024;
const MAXIMUM_TRACKS = 2_002;

function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function requireInteger(
  value: number,
  minimum: number,
  maximum: number,
  code: string,
): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new AudiobookRetailTrackRenderError(code);
  }
  return value;
}

function requireHash(value: string, code: string): string {
  if (!HASH_PATTERN.test(value)) {
    throw new AudiobookRetailTrackRenderError(code);
  }
  return value;
}

function safeExecutableName(value: string): string {
  const name = basename(value.trim());
  if (!name || name.length > 200 || CONTROL_CHARACTERS.test(name)) {
    throw new AudiobookRetailTrackRenderError(
      "AUDIOBOOK_RETAIL_TRACK_RENDER_EXECUTABLE_INVALID",
    );
  }
  return name;
}

function versionLine(value: string): string {
  const line = value
    .split(/\r?\n/u)
    .map((part) => part.trim())
    .find(Boolean);
  if (!line || line.length > 500 || CONTROL_CHARACTERS.test(line)) {
    throw new AudiobookRetailTrackRenderError(
      "AUDIOBOOK_RETAIL_TRACK_RENDER_TOOL_VERSION_INVALID",
    );
  }
  return line;
}

function seconds(milliseconds: number): string {
  return (milliseconds / 1_000).toFixed(6);
}

function channelLayout(channels: 1 | 2): "mono" | "stereo" {
  return channels === 1 ? "mono" : "stereo";
}

export function buildAudiobookRetailTrackFilter(
  track: AudiobookRetailTrack,
): string {
  return [
    `[0:a]atrim=start=${seconds(track.sourceStartMs)}:duration=${seconds(track.durationMs)}`,
    "asetpts=PTS-STARTPTS",
    `aformat=sample_rates=${track.output.sampleRateHz}:channel_layouts=${channelLayout(track.output.channels)}`,
    "[out]",
  ].join(",").replace(",[out]", "[out]") + "\n";
}

function estimateMaximumEncodedBytes(track: AudiobookRetailTrack): number {
  const payload = Math.ceil(
    (track.durationMs / 1_000)
      * track.output.bitRateKbps
      * 1_000
      / 8,
  );
  return requireInteger(
    payload + MP3_ESTIMATE_OVERHEAD_BYTES,
    1,
    Number.MAX_SAFE_INTEGER,
    "AUDIOBOOK_RETAIL_TRACK_RENDER_ESTIMATED_SIZE_INVALID",
  );
}

function commandFingerprint(
  plan: AudiobookRetailTrackPlan,
  track: AudiobookRetailTrack,
  filterScript: string,
): string {
  return stableHash({
    planFingerprint: plan.fingerprint,
    referenceContentHash: plan.referenceMaster.contentHash,
    trackFingerprint: track.fingerprint,
    fileName: track.fileName,
    sourceStartMs: track.sourceStartMs,
    durationMs: track.durationMs,
    filterFingerprint: stableHash(filterScript),
    output: track.output,
    encoder: "libmp3lame",
    metadata: "stripped",
    shell: false,
  });
}

function renderedTrackFingerprint(
  value: Omit<AudiobookRetailRenderedTrackEvidence, "fingerprint">,
): string {
  return stableHash(value);
}

function renderFingerprint(
  value: Omit<AudiobookRetailTrackRenderEvidence, "fingerprint">,
): string {
  return stableHash(value);
}

function assertReadyPlan(plan: AudiobookRetailTrackPlan): void {
  assertAudiobookRetailTrackPlan(plan);
  if (
    plan.status !== "ready-for-encoding"
    || plan.blockers.length !== 0
    || plan.tracks.length === 0
    || plan.tracks.length > MAXIMUM_TRACKS
  ) {
    throw new AudiobookRetailTrackRenderError(
      "AUDIOBOOK_RETAIL_TRACK_RENDER_PLAN_NOT_READY",
    );
  }
}

function assertResolvedReference(
  plan: AudiobookRetailTrackPlan,
  source: ResolvedAudiobookRetailReferenceMaster,
): void {
  if (
    source.artifactId !== plan.referenceMaster.id
    || source.artifactRevision !== plan.referenceMaster.revision
    || source.artifactFingerprint !== plan.referenceMaster.fingerprint
    || source.contentHash !== plan.referenceMaster.contentHash
    || source.byteCount !== plan.referenceMaster.byteCount
  ) {
    throw new AudiobookRetailTrackRenderError(
      "AUDIOBOOK_RETAIL_TRACK_RENDER_SOURCE_INTEGRITY_MISMATCH",
    );
  }
  if (!source.privatePath.trim() || source.privatePath.includes("\0")) {
    throw new AudiobookRetailTrackRenderError(
      "AUDIOBOOK_RETAIL_TRACK_RENDER_PRIVATE_PATH_INVALID",
    );
  }
}

function assertTrackOutput(output: AudiobookRetailRenderedTrackOutput): void {
  if (
    output.format !== "mp3"
    || output.codec !== "mp3"
    || output.encoder !== "libmp3lame"
    || output.bitRateMode !== "cbr"
    || ![192, 256, 320].includes(output.bitRateKbps)
    || output.sampleRateHz !== 44_100
    || (output.channels !== 1 && output.channels !== 2)
  ) {
    throw new AudiobookRetailTrackRenderError(
      "AUDIOBOOK_RETAIL_TRACK_RENDER_OUTPUT_PROFILE_INVALID",
    );
  }
  requireHash(
    output.contentHash,
    "AUDIOBOOK_RETAIL_TRACK_RENDER_OUTPUT_HASH_INVALID",
  );
  requireInteger(
    output.byteCount,
    1,
    ABSOLUTE_MAXIMUM_TRACK_OUTPUT_BYTES,
    "AUDIOBOOK_RETAIL_TRACK_RENDER_OUTPUT_SIZE_INVALID",
  );
  if (output.mediaSignature !== "mpeg-audio") {
    throw new AudiobookRetailTrackRenderError(
      "AUDIOBOOK_RETAIL_TRACK_RENDER_OUTPUT_SIGNATURE_INVALID",
    );
  }
}

function assertRenderedTrack(
  track: AudiobookRetailRenderedTrackEvidence,
): void {
  requireInteger(
    track.ordinal,
    1,
    MAXIMUM_TRACKS,
    "AUDIOBOOK_RETAIL_TRACK_RENDER_TRACK_ORDINAL_INVALID",
  );
  if (!FILE_NAME_PATTERN.test(track.fileName)) {
    throw new AudiobookRetailTrackRenderError(
      "AUDIOBOOK_RETAIL_TRACK_RENDER_FILE_NAME_INVALID",
    );
  }
  requireHash(
    track.trackFingerprint,
    "AUDIOBOOK_RETAIL_TRACK_RENDER_TRACK_HASH_INVALID",
  );
  requireInteger(
    track.sourceStartMs,
    0,
    Number.MAX_SAFE_INTEGER,
    "AUDIOBOOK_RETAIL_TRACK_RENDER_SOURCE_RANGE_INVALID",
  );
  requireInteger(
    track.sourceEndMs,
    1,
    Number.MAX_SAFE_INTEGER,
    "AUDIOBOOK_RETAIL_TRACK_RENDER_SOURCE_RANGE_INVALID",
  );
  requireInteger(
    track.expectedDurationMs,
    1,
    7_200_000,
    "AUDIOBOOK_RETAIL_TRACK_RENDER_DURATION_INVALID",
  );
  if (
    track.sourceEndMs - track.sourceStartMs !== track.expectedDurationMs
  ) {
    throw new AudiobookRetailTrackRenderError(
      "AUDIOBOOK_RETAIL_TRACK_RENDER_SOURCE_RANGE_MISMATCH",
    );
  }
  assertTrackOutput(track.output);
  requireHash(
    track.filterFingerprint,
    "AUDIOBOOK_RETAIL_TRACK_RENDER_FILTER_HASH_INVALID",
  );
  requireHash(
    track.commandFingerprint,
    "AUDIOBOOK_RETAIL_TRACK_RENDER_COMMAND_HASH_INVALID",
  );
  const { fingerprint, ...partial } = track;
  if (renderedTrackFingerprint(partial) !== fingerprint) {
    throw new AudiobookRetailTrackRenderError(
      "AUDIOBOOK_RETAIL_TRACK_RENDER_TRACK_FINGERPRINT_INVALID",
    );
  }
}

export function assertAudiobookRetailTrackRenderEvidence(
  evidence: AudiobookRetailTrackRenderEvidence,
): void {
  if (
    evidence.schemaVersion !== AUDIOBOOK_RETAIL_TRACK_RENDER_SCHEMA_VERSION
  ) {
    throw new AudiobookRetailTrackRenderError(
      "AUDIOBOOK_RETAIL_TRACK_RENDER_SCHEMA_UNSUPPORTED",
    );
  }
  if (!SAFE_IDENTIFIER.test(evidence.id)) {
    throw new AudiobookRetailTrackRenderError(
      "AUDIOBOOK_RETAIL_TRACK_RENDER_ID_INVALID",
    );
  }
  if (!SAFE_IDENTIFIER.test(evidence.planId)) {
    throw new AudiobookRetailTrackRenderError(
      "AUDIOBOOK_RETAIL_TRACK_RENDER_PLAN_ID_INVALID",
    );
  }
  requireHash(
    evidence.planFingerprint,
    "AUDIOBOOK_RETAIL_TRACK_RENDER_PLAN_HASH_INVALID",
  );
  if (!SAFE_IDENTIFIER.test(evidence.referenceMaster.artifactId)) {
    throw new AudiobookRetailTrackRenderError(
      "AUDIOBOOK_RETAIL_TRACK_RENDER_SOURCE_ID_INVALID",
    );
  }
  requireInteger(
    evidence.referenceMaster.artifactRevision,
    1,
    Number.MAX_SAFE_INTEGER,
    "AUDIOBOOK_RETAIL_TRACK_RENDER_SOURCE_REVISION_INVALID",
  );
  requireHash(
    evidence.referenceMaster.artifactFingerprint,
    "AUDIOBOOK_RETAIL_TRACK_RENDER_SOURCE_FINGERPRINT_INVALID",
  );
  requireHash(
    evidence.referenceMaster.contentHash,
    "AUDIOBOOK_RETAIL_TRACK_RENDER_SOURCE_HASH_INVALID",
  );
  requireInteger(
    evidence.referenceMaster.byteCount,
    1,
    Number.MAX_SAFE_INTEGER,
    "AUDIOBOOK_RETAIL_TRACK_RENDER_SOURCE_SIZE_INVALID",
  );
  if (
    !Array.isArray(evidence.tracks)
    || evidence.tracks.length === 0
    || evidence.tracks.length > MAXIMUM_TRACKS
  ) {
    throw new AudiobookRetailTrackRenderError(
      "AUDIOBOOK_RETAIL_TRACK_RENDER_TRACKS_INVALID",
    );
  }
  const names = new Set<string>();
  let previousEnd = 0;
  for (const [index, track] of evidence.tracks.entries()) {
    assertRenderedTrack(track);
    if (track.ordinal !== index + 1 || track.sourceStartMs !== previousEnd) {
      throw new AudiobookRetailTrackRenderError(
        "AUDIOBOOK_RETAIL_TRACK_RENDER_TRACK_ORDER_INVALID",
      );
    }
    if (names.has(track.fileName)) {
      throw new AudiobookRetailTrackRenderError(
        "AUDIOBOOK_RETAIL_TRACK_RENDER_FILE_NAME_DUPLICATE",
      );
    }
    names.add(track.fileName);
    previousEnd = track.sourceEndMs;
  }
  safeExecutableName(evidence.tool.executableName);
  const checkedVersion = versionLine(evidence.tool.versionLine);
  requireHash(
    evidence.tool.versionFingerprint,
    "AUDIOBOOK_RETAIL_TRACK_RENDER_TOOL_VERSION_HASH_INVALID",
  );
  if (stableHash(checkedVersion) !== evidence.tool.versionFingerprint) {
    throw new AudiobookRetailTrackRenderError(
      "AUDIOBOOK_RETAIL_TRACK_RENDER_TOOL_VERSION_MISMATCH",
    );
  }
  if (Number.isNaN(Date.parse(evidence.renderedAt))) {
    throw new AudiobookRetailTrackRenderError(
      "AUDIOBOOK_RETAIL_TRACK_RENDER_DATE_INVALID",
    );
  }
  const { fingerprint, ...partial } = evidence;
  if (
    !HASH_PATTERN.test(fingerprint)
    || renderFingerprint(partial) !== fingerprint
  ) {
    throw new AudiobookRetailTrackRenderError(
      "AUDIOBOOK_RETAIL_TRACK_RENDER_FINGERPRINT_INVALID",
    );
  }
}

export function assertAudiobookRetailTrackRenderMatchesPlan(
  evidence: AudiobookRetailTrackRenderEvidence,
  plan: AudiobookRetailTrackPlan,
): void {
  assertAudiobookRetailTrackRenderEvidence(evidence);
  assertReadyPlan(plan);
  if (
    evidence.planId !== plan.id
    || evidence.planFingerprint !== plan.fingerprint
    || evidence.referenceMaster.artifactId !== plan.referenceMaster.id
    || evidence.referenceMaster.artifactRevision !== plan.referenceMaster.revision
    || evidence.referenceMaster.artifactFingerprint
      !== plan.referenceMaster.fingerprint
    || evidence.referenceMaster.contentHash !== plan.referenceMaster.contentHash
    || evidence.referenceMaster.byteCount !== plan.referenceMaster.byteCount
    || evidence.tracks.length !== plan.tracks.length
  ) {
    throw new AudiobookRetailTrackRenderError(
      "AUDIOBOOK_RETAIL_TRACK_RENDER_PLAN_SOURCE_MISMATCH",
    );
  }
  for (const [index, rendered] of evidence.tracks.entries()) {
    const planned = plan.tracks[index];
    if (
      !planned
      || rendered.ordinal !== planned.ordinal
      || rendered.role !== planned.role
      || rendered.fileName !== planned.fileName
      || rendered.trackFingerprint !== planned.fingerprint
      || rendered.sourceStartMs !== planned.sourceStartMs
      || rendered.sourceEndMs !== planned.sourceEndMs
      || rendered.expectedDurationMs !== planned.durationMs
      || stableHash({
        format: rendered.output.format,
        codec: rendered.output.codec,
        bitRateMode: rendered.output.bitRateMode,
        bitRateKbps: rendered.output.bitRateKbps,
        sampleRateHz: rendered.output.sampleRateHz,
        channels: rendered.output.channels,
      }) !== stableHash(planned.output)
      || rendered.filterFingerprint
        !== stableHash(buildAudiobookRetailTrackFilter(planned))
      || rendered.commandFingerprint
        !== commandFingerprint(
          plan,
          planned,
          buildAudiobookRetailTrackFilter(planned),
        )
    ) {
      throw new AudiobookRetailTrackRenderError(
        "AUDIOBOOK_RETAIL_TRACK_RENDER_PLAN_SOURCE_MISMATCH",
      );
    }
  }
}

export function assertAudiobookRetailTrackRenderResult(
  result: AudiobookRetailTrackRenderResult,
): void {
  assertAudiobookRetailTrackRenderEvidence(result.evidence);
  if (
    !Array.isArray(result.tracks)
    || result.tracks.length !== result.evidence.tracks.length
  ) {
    throw new AudiobookRetailTrackRenderError(
      "AUDIOBOOK_RETAIL_TRACK_RENDER_RESULT_TRACKS_INVALID",
    );
  }
  for (const [index, output] of result.tracks.entries()) {
    const evidence = result.evidence.tracks[index];
    if (
      !evidence
      || output.fileName !== evidence.fileName
      || !(output.bytes instanceof Uint8Array)
      || output.bytes.byteLength !== evidence.output.byteCount
      || hashBytes(output.bytes) !== evidence.output.contentHash
    ) {
      throw new AudiobookRetailTrackRenderError(
        "AUDIOBOOK_RETAIL_TRACK_RENDER_RESULT_INTEGRITY_MISMATCH",
      );
    }
    const media = detectArtifactMedia(output.bytes);
    if (
      media.format !== "mp3"
      || media.mimeType !== "audio/mpeg"
      || media.signature !== evidence.output.mediaSignature
    ) {
      throw new AudiobookRetailTrackRenderError(
        "AUDIOBOOK_RETAIL_TRACK_RENDER_RESULT_MEDIA_MISMATCH",
      );
    }
  }
}

function signalError(): AudiobookRetailTrackRenderError {
  return new AudiobookRetailTrackRenderError(
    "AUDIOBOOK_RETAIL_TRACK_RENDER_ABORTED",
  );
}

async function spawnBounded(input: Readonly<{
  executable: string;
  args: readonly string[];
  timeoutMs: number;
  maximumOutputBytes: number;
  signal?: AbortSignal;
}>): Promise<Readonly<{ stdout: string; stderr: string }>> {
  if (input.signal?.aborted) throw signalError();
  return await new Promise((resolvePromise, rejectPromise) => {
    let settled = false;
    let timedOut = false;
    let exceeded = false;
    let aborted = false;
    let totalBytes = 0;
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const child = spawn(input.executable, [...input.args], {
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const finishError = (code: string): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      input.signal?.removeEventListener("abort", onAbort);
      rejectPromise(new AudiobookRetailTrackRenderError(code));
    };
    const onAbort = (): void => {
      aborted = true;
      child.kill("SIGKILL");
    };
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, input.timeoutMs);
    const collect = (target: Buffer[], chunk: Buffer | string): void => {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += bytes.byteLength;
      if (totalBytes > input.maximumOutputBytes) {
        exceeded = true;
        child.kill("SIGKILL");
        return;
      }
      target.push(bytes);
    };
    input.signal?.addEventListener("abort", onAbort, { once: true });
    child.stdout?.on("data", (chunk: Buffer | string) => collect(stdout, chunk));
    child.stderr?.on("data", (chunk: Buffer | string) => collect(stderr, chunk));
    child.once("error", () =>
      finishError("AUDIOBOOK_RETAIL_TRACK_RENDER_EXECUTABLE_UNAVAILABLE")
    );
    child.once("close", (exitCode) => {
      if (settled) return;
      if (aborted) {
        return finishError("AUDIOBOOK_RETAIL_TRACK_RENDER_ABORTED");
      }
      if (timedOut) {
        return finishError("AUDIOBOOK_RETAIL_TRACK_RENDER_TIMEOUT");
      }
      if (exceeded) {
        return finishError(
          "AUDIOBOOK_RETAIL_TRACK_RENDER_PROCESS_OUTPUT_TOO_LARGE",
        );
      }
      if (exitCode !== 0) {
        return finishError("AUDIOBOOK_RETAIL_TRACK_RENDER_COMMAND_FAILED");
      }
      settled = true;
      clearTimeout(timer);
      input.signal?.removeEventListener("abort", onAbort);
      resolvePromise({
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      });
    });
  });
}

export class NodeAudiobookRetailTrackRenderRunner
implements AudiobookRetailTrackRenderRunner {
  readonly #ffmpegPath: string;
  readonly #temporaryRoot: string;

  constructor(input: Readonly<{
    ffmpegPath?: string;
    temporaryRoot?: string;
  }> = {}) {
    this.#ffmpegPath = input.ffmpegPath?.trim() || "ffmpeg";
    safeExecutableName(this.#ffmpegPath);
    this.#temporaryRoot = resolve(input.temporaryRoot ?? tmpdir());
  }

  async inspectVersion(signal?: AbortSignal): Promise<string> {
    const result = await spawnBounded({
      executable: this.#ffmpegPath,
      args: ["-version"],
      timeoutMs: 15_000,
      maximumOutputBytes: 256 * 1024,
      ...(signal ? { signal } : {}),
    });
    return versionLine(`${result.stdout}\n${result.stderr}`);
  }

  async render(
    request: AudiobookRetailTrackRenderRequest,
    signal?: AbortSignal,
  ): Promise<Uint8Array> {
    requireInteger(
      request.timeoutMs,
      100,
      MAXIMUM_TIMEOUT_MS,
      "AUDIOBOOK_RETAIL_TRACK_RENDER_TIMEOUT_INVALID",
    );
    requireInteger(
      request.maximumOutputBytes,
      1,
      ABSOLUTE_MAXIMUM_TRACK_OUTPUT_BYTES,
      "AUDIOBOOK_RETAIL_TRACK_RENDER_OUTPUT_LIMIT_INVALID",
    );
    requireInteger(
      request.sourceStartMs,
      0,
      Number.MAX_SAFE_INTEGER,
      "AUDIOBOOK_RETAIL_TRACK_RENDER_SOURCE_RANGE_INVALID",
    );
    requireInteger(
      request.durationMs,
      1,
      7_200_000,
      "AUDIOBOOK_RETAIL_TRACK_RENDER_DURATION_INVALID",
    );
    if (!request.sourcePath.trim() || request.sourcePath.includes("\0")) {
      throw new AudiobookRetailTrackRenderError(
        "AUDIOBOOK_RETAIL_TRACK_RENDER_PRIVATE_PATH_INVALID",
      );
    }
    if (
      !request.filterScript.trim()
      || request.filterScript.length > 64 * 1024
      || CONTROL_CHARACTERS.test(request.filterScript)
    ) {
      throw new AudiobookRetailTrackRenderError(
        "AUDIOBOOK_RETAIL_TRACK_RENDER_FILTER_INVALID",
      );
    }
    if (
      request.output.format !== "mp3"
      || request.output.codec !== "mp3"
      || request.output.bitRateMode !== "cbr"
      || ![192, 256, 320].includes(request.output.bitRateKbps)
      || request.output.sampleRateHz !== 44_100
      || (request.output.channels !== 1 && request.output.channels !== 2)
    ) {
      throw new AudiobookRetailTrackRenderError(
        "AUDIOBOOK_RETAIL_TRACK_RENDER_OUTPUT_PROFILE_INVALID",
      );
    }
    if (signal?.aborted) throw signalError();
    await mkdir(this.#temporaryRoot, { recursive: true, mode: 0o700 });
    const directory = await mkdtemp(
      join(this.#temporaryRoot, "storyteller-retail-track-render-"),
    );
    const outputPath = join(directory, "track.mp3");
    try {
      const args = [
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        request.sourcePath,
        "-map",
        "0:a:0",
        "-af",
        request.filterScript.trim(),
        "-vn",
        "-sn",
        "-dn",
        "-ar",
        String(request.output.sampleRateHz),
        "-ac",
        String(request.output.channels),
        "-c:a",
        "libmp3lame",
        "-b:a",
        `${request.output.bitRateKbps}k`,
        "-map_metadata",
        "-1",
        "-write_id3v1",
        "0",
        "-id3v2_version",
        "0",
        "-write_xing",
        "0",
        outputPath,
      ];
      await spawnBounded({
        executable: this.#ffmpegPath,
        args,
        timeoutMs: request.timeoutMs,
        maximumOutputBytes: PROCESS_OUTPUT_LIMIT_BYTES,
        ...(signal ? { signal } : {}),
      });
      const buffer = await readFile(outputPath);
      if (
        buffer.byteLength === 0
        || buffer.byteLength > request.maximumOutputBytes
      ) {
        throw new AudiobookRetailTrackRenderError(
          "AUDIOBOOK_RETAIL_TRACK_RENDER_OUTPUT_SIZE_INVALID",
        );
      }
      return new Uint8Array(
        buffer.buffer,
        buffer.byteOffset,
        buffer.byteLength,
      );
    } catch (error) {
      if (error instanceof AudiobookRetailTrackRenderError) throw error;
      throw new AudiobookRetailTrackRenderError(
        "AUDIOBOOK_RETAIL_TRACK_RENDER_EXECUTION_FAILED",
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}

export async function renderAudiobookRetailTrackPlan(
  input: RenderAudiobookRetailTrackPlanInput,
): Promise<AudiobookRetailTrackRenderResult> {
  assertReadyPlan(input.plan);
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maximumTrackOutputBytes = input.maximumTrackOutputBytes
    ?? DEFAULT_MAXIMUM_TRACK_OUTPUT_BYTES;
  const maximumTotalOutputBytes = input.maximumTotalOutputBytes
    ?? DEFAULT_MAXIMUM_TOTAL_OUTPUT_BYTES;
  requireInteger(
    timeoutMs,
    100,
    MAXIMUM_TIMEOUT_MS,
    "AUDIOBOOK_RETAIL_TRACK_RENDER_TIMEOUT_INVALID",
  );
  requireInteger(
    maximumTrackOutputBytes,
    1,
    ABSOLUTE_MAXIMUM_TRACK_OUTPUT_BYTES,
    "AUDIOBOOK_RETAIL_TRACK_RENDER_OUTPUT_LIMIT_INVALID",
  );
  requireInteger(
    maximumTotalOutputBytes,
    1,
    ABSOLUTE_MAXIMUM_TOTAL_OUTPUT_BYTES,
    "AUDIOBOOK_RETAIL_TRACK_RENDER_TOTAL_OUTPUT_LIMIT_INVALID",
  );
  for (const track of input.plan.tracks) {
    if (estimateMaximumEncodedBytes(track) > maximumTrackOutputBytes) {
      throw new AudiobookRetailTrackRenderError(
        "AUDIOBOOK_RETAIL_TRACK_RENDER_ESTIMATED_SIZE_EXCEEDS_LIMIT",
      );
    }
  }
  const renderedAt = input.renderedAt ?? new Date();
  if (
    Number.isNaN(renderedAt.getTime())
    || renderedAt.getTime() < Date.parse(input.plan.createdAt)
  ) {
    throw new AudiobookRetailTrackRenderError(
      "AUDIOBOOK_RETAIL_TRACK_RENDER_DATE_INVALID",
    );
  }
  if (input.signal?.aborted) throw signalError();

  let source: ResolvedAudiobookRetailReferenceMaster | undefined;
  try {
    source = await input.referenceMaster.resolve(
      input.plan.referenceMaster,
      input.signal,
    );
    assertResolvedReference(input.plan, source);
    const runner = input.runner ?? new NodeAudiobookRetailTrackRenderRunner({
      ...(input.ffmpegPath ? { ffmpegPath: input.ffmpegPath } : {}),
      ...(input.temporaryRoot ? { temporaryRoot: input.temporaryRoot } : {}),
    });
    const checkedVersion = versionLine(
      await runner.inspectVersion(input.signal),
    );
    const renderedTracks: AudiobookRetailRenderedTrack[] = [];
    const trackEvidence: AudiobookRetailRenderedTrackEvidence[] = [];
    let totalOutputBytes = 0;

    for (const track of input.plan.tracks) {
      if (input.signal?.aborted) throw signalError();
      const filterScript = buildAudiobookRetailTrackFilter(track);
      let bytes: Uint8Array;
      try {
        bytes = await runner.render({
          sourcePath: source.privatePath,
          sourceStartMs: track.sourceStartMs,
          durationMs: track.durationMs,
          filterScript,
          output: track.output,
          timeoutMs,
          maximumOutputBytes: maximumTrackOutputBytes,
        }, input.signal);
      } catch (error) {
        if (error instanceof AudiobookRetailTrackRenderError) throw error;
        throw new AudiobookRetailTrackRenderError(
          "AUDIOBOOK_RETAIL_TRACK_RENDER_RUNNER_FAILED",
        );
      }
      if (
        !(bytes instanceof Uint8Array)
        || bytes.byteLength === 0
        || bytes.byteLength > maximumTrackOutputBytes
      ) {
        throw new AudiobookRetailTrackRenderError(
          "AUDIOBOOK_RETAIL_TRACK_RENDER_OUTPUT_SIZE_INVALID",
        );
      }
      totalOutputBytes += bytes.byteLength;
      if (totalOutputBytes > maximumTotalOutputBytes) {
        throw new AudiobookRetailTrackRenderError(
          "AUDIOBOOK_RETAIL_TRACK_RENDER_TOTAL_OUTPUT_LIMIT_EXCEEDED",
        );
      }
      const media = detectArtifactMedia(bytes);
      if (
        media.format !== "mp3"
        || media.mimeType !== "audio/mpeg"
        || media.signature !== "mpeg-audio"
      ) {
        throw new AudiobookRetailTrackRenderError(
          "AUDIOBOOK_RETAIL_TRACK_RENDER_OUTPUT_MEDIA_INVALID",
        );
      }
      const partial: Omit<
        AudiobookRetailRenderedTrackEvidence,
        "fingerprint"
      > = {
        ordinal: track.ordinal,
        role: track.role,
        fileName: track.fileName,
        trackFingerprint: track.fingerprint,
        sourceStartMs: track.sourceStartMs,
        sourceEndMs: track.sourceEndMs,
        expectedDurationMs: track.durationMs,
        output: Object.freeze({
          format: "mp3",
          codec: "mp3",
          encoder: "libmp3lame",
          bitRateMode: "cbr",
          bitRateKbps: track.output.bitRateKbps,
          sampleRateHz: 44_100,
          channels: track.output.channels,
          contentHash: hashBytes(bytes),
          byteCount: bytes.byteLength,
          mediaSignature: "mpeg-audio",
        }),
        filterFingerprint: stableHash(filterScript),
        commandFingerprint: commandFingerprint(
          input.plan,
          track,
          filterScript,
        ),
      };
      const evidence = Object.freeze({
        ...partial,
        fingerprint: renderedTrackFingerprint(partial),
      });
      assertRenderedTrack(evidence);
      trackEvidence.push(evidence);
      renderedTracks.push(Object.freeze({
        fileName: track.fileName,
        bytes,
      }));
    }

    const partial: Omit<
      AudiobookRetailTrackRenderEvidence,
      "fingerprint"
    > = {
      schemaVersion: AUDIOBOOK_RETAIL_TRACK_RENDER_SCHEMA_VERSION,
      id: `retail_track_render_${stableHash({
        plan: input.plan.fingerprint,
        outputs: trackEvidence.map((track) => track.output.contentHash),
      }).slice(0, 24)}`,
      planId: input.plan.id,
      planFingerprint: input.plan.fingerprint,
      referenceMaster: Object.freeze({
        artifactId: input.plan.referenceMaster.id,
        artifactRevision: input.plan.referenceMaster.revision,
        artifactFingerprint: input.plan.referenceMaster.fingerprint,
        contentHash: input.plan.referenceMaster.contentHash,
        byteCount: input.plan.referenceMaster.byteCount,
      }),
      tracks: Object.freeze(trackEvidence),
      tool: Object.freeze({
        executableName: safeExecutableName(input.ffmpegPath ?? "ffmpeg"),
        versionLine: checkedVersion,
        versionFingerprint: stableHash(checkedVersion),
      }),
      renderedAt: renderedAt.toISOString(),
    };
    const evidence = Object.freeze({
      ...partial,
      fingerprint: renderFingerprint(partial),
    });
    const result = Object.freeze({
      evidence,
      tracks: Object.freeze(renderedTracks),
    });
    assertAudiobookRetailTrackRenderEvidence(evidence);
    assertAudiobookRetailTrackRenderMatchesPlan(evidence, input.plan);
    assertAudiobookRetailTrackRenderResult(result);
    return result;
  } catch (error) {
    if (error instanceof AudiobookRetailTrackRenderError) throw error;
    throw new AudiobookRetailTrackRenderError(
      "AUDIOBOOK_RETAIL_TRACK_RENDER_FAILED",
    );
  } finally {
    if (source) {
      try {
        await source.dispose();
      } catch {
        // Preserve the primary result. Private-source disposal remains safe to retry.
      }
    }
  }
}

export function audiobookRetailTrackRenderPublicView(
  evidence: AudiobookRetailTrackRenderEvidence,
): AudiobookRetailTrackRenderPublicView {
  assertAudiobookRetailTrackRenderEvidence(evidence);
  return Object.freeze({
    id: evidence.id,
    planId: evidence.planId,
    planFingerprint: evidence.planFingerprint,
    trackCount: evidence.tracks.length,
    totalOutputBytes: evidence.tracks.reduce(
      (total, track) => total + track.output.byteCount,
      0,
    ),
    tracks: Object.freeze(evidence.tracks.map((track) => Object.freeze({
      ordinal: track.ordinal,
      role: track.role,
      fileName: track.fileName,
      expectedDurationMs: track.expectedDurationMs,
      output: track.output,
    }))),
    toolVersionFingerprint: evidence.tool.versionFingerprint,
    renderedAt: evidence.renderedAt,
    fingerprint: evidence.fingerprint,
  });
}
