import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { basename, join, resolve } from "node:path";
import {
  mkdtemp,
  mkdir,
  open,
  readFile,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  assertChapterAssemblyPlan,
  type ChapterAssemblyArtifactSnapshot,
  type ChapterAssemblyPlan,
  type ChapterAssemblySegment,
} from "./chapter-assembly.js";
import { stableHash } from "./index.js";
import { detectArtifactMedia } from "./private-object-store.js";

export const CHAPTER_RENDER_SCHEMA_VERSION = "storyteller-chapter-render-v1" as const;

export interface ResolvedChapterSource {
  artifactId: string;
  privatePath: string;
  contentHash: string;
  byteCount: number;
  dispose(): Promise<void>;
}

export interface ChapterSourceResolver {
  resolve(
    snapshot: ChapterAssemblyArtifactSnapshot,
    signal?: AbortSignal,
  ): Promise<ResolvedChapterSource>;
}

export interface ChapterRenderRequest {
  sourcePaths: readonly string[];
  filterScript: string;
  sampleRateHz: number;
  channels: 1 | 2;
  bitDepth: 16 | 24 | 32;
  expectedDurationMs: number;
  timeoutMs: number;
  maximumOutputBytes: number;
}

export interface ChapterRenderRunner {
  inspectVersion(signal?: AbortSignal): Promise<string>;
  render(request: ChapterRenderRequest, signal?: AbortSignal): Promise<Uint8Array>;
}

export interface ChapterRenderSourceEvidence {
  artifactId: string;
  artifactFingerprint: string;
  contentHash: string;
  byteCount: number;
}

export interface ChapterRenderEvidence {
  schemaVersion: typeof CHAPTER_RENDER_SCHEMA_VERSION;
  id: string;
  planId: string;
  planFingerprint: string;
  sources: readonly ChapterRenderSourceEvidence[];
  expectedDurationMs: number;
  output: Readonly<{
    format: "wav";
    sampleRateHz: number;
    channels: 1 | 2;
    bitDepth: 16 | 24 | 32;
    contentHash: string;
    byteCount: number;
    mediaSignature: string;
  }>;
  tool: Readonly<{
    executableName: string;
    versionLine: string;
    versionFingerprint: string;
  }>;
  filterFingerprint: string;
  commandFingerprint: string;
  renderedAt: string;
  fingerprint: string;
}

export interface ChapterRenderResult {
  evidence: ChapterRenderEvidence;
  bytes: Uint8Array;
}

export interface ChapterRenderPublicView {
  id: string;
  planId: string;
  planFingerprint: string;
  sourceCount: number;
  expectedDurationMs: number;
  output: ChapterRenderEvidence["output"];
  toolVersionFingerprint: string;
  filterFingerprint: string;
  renderedAt: string;
  fingerprint: string;
}

export interface RenderChapterAssemblyInput {
  plan: ChapterAssemblyPlan;
  sources: ChapterSourceResolver;
  runner?: ChapterRenderRunner;
  ffmpegPath?: string;
  temporaryRoot?: string;
  timeoutMs?: number;
  maximumOutputBytes?: number;
  renderedAt?: Date;
  signal?: AbortSignal;
}

export class ChapterRenderError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "ChapterRenderError";
    this.code = code;
  }
}

const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const DEFAULT_TIMEOUT_MS = 15 * 60_000;
const DEFAULT_MAXIMUM_OUTPUT_BYTES = 2 * 1024 * 1024 * 1024;
const ABSOLUTE_MAXIMUM_OUTPUT_BYTES = 4 * 1024 * 1024 * 1024;

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
    throw new ChapterRenderError(code);
  }
  return value;
}

function safeExecutableName(value: string): string {
  const name = basename(value.trim());
  if (!name || name.length > 200 || CONTROL_CHARACTERS.test(name)) {
    throw new ChapterRenderError("CHAPTER_RENDER_EXECUTABLE_INVALID");
  }
  return name;
}

function codecFor(bitDepth: ChapterAssemblyPlan["output"]["bitDepth"]): string {
  switch (bitDepth) {
    case 16:
      return "pcm_s16le";
    case 24:
      return "pcm_s24le";
    case 32:
      return "pcm_s32le";
  }
}

function channelLayout(channels: 1 | 2): string {
  return channels === 1 ? "mono" : "stereo";
}

function seconds(milliseconds: number): string {
  return (milliseconds / 1_000).toFixed(6);
}

function segmentFilter(segment: ChapterAssemblySegment, index: number): string {
  const endSeconds = (segment.sourceDurationMs - segment.trimEndMs) / 1_000;
  const filters = [
    `atrim=start=${seconds(segment.trimStartMs)}:end=${endSeconds.toFixed(6)}`,
    "asetpts=PTS-STARTPTS",
  ];
  if (segment.fadeInMs > 0) {
    filters.push(`afade=t=in:st=0:d=${seconds(segment.fadeInMs)}`);
  }
  if (segment.fadeOutMs > 0) {
    filters.push(
      `afade=t=out:st=${seconds(segment.renderedDurationMs - segment.fadeOutMs)}:d=${seconds(segment.fadeOutMs)}`,
    );
  }
  filters.push(`adelay=${segment.timelineStartMs}|${segment.timelineStartMs}`);
  return `[${index}:a]${filters.join(",")}[segment_${index}]`;
}

export function buildChapterFilterScript(plan: ChapterAssemblyPlan): string {
  assertChapterAssemblyPlan(plan);
  const lines = plan.segments.map((segment, index) => segmentFilter(segment, index));
  lines.push(
    `anullsrc=r=${plan.output.sampleRateHz}:cl=${channelLayout(plan.output.channels)}:d=${seconds(plan.renderedDurationMs)}[base]`,
  );
  const inputs = ["[base]", ...plan.segments.map((_, index) => `[segment_${index}]`)].join("");
  lines.push(`${inputs}amix=inputs=${plan.segments.length + 1}:normalize=0:dropout_transition=0[out]`);
  return `${lines.join(";\n")}\n`;
}

function versionLine(output: string): string {
  const line = output.split(/\r?\n/u).map((value) => value.trim()).find(Boolean);
  if (!line || line.length > 500 || CONTROL_CHARACTERS.test(line)) {
    throw new ChapterRenderError("CHAPTER_RENDER_TOOL_VERSION_INVALID");
  }
  return line;
}

function evidenceFingerprint(
  evidence: Omit<ChapterRenderEvidence, "fingerprint">,
): string {
  return stableHash(evidence);
}

function assertSourceEvidence(source: ChapterRenderSourceEvidence): void {
  if (!SAFE_IDENTIFIER.test(source.artifactId)) throw new ChapterRenderError("CHAPTER_RENDER_SOURCE_ID_INVALID");
  if (!HASH_PATTERN.test(source.artifactFingerprint)) {
    throw new ChapterRenderError("CHAPTER_RENDER_SOURCE_FINGERPRINT_INVALID");
  }
  if (!HASH_PATTERN.test(source.contentHash)) throw new ChapterRenderError("CHAPTER_RENDER_SOURCE_HASH_INVALID");
  requireInteger(source.byteCount, 1, Number.MAX_SAFE_INTEGER, "CHAPTER_RENDER_SOURCE_SIZE_INVALID");
}

export function assertChapterRenderEvidence(evidence: ChapterRenderEvidence): void {
  if (evidence.schemaVersion !== CHAPTER_RENDER_SCHEMA_VERSION) {
    throw new ChapterRenderError("CHAPTER_RENDER_SCHEMA_UNSUPPORTED");
  }
  if (!SAFE_IDENTIFIER.test(evidence.id)) throw new ChapterRenderError("CHAPTER_RENDER_ID_INVALID");
  if (!SAFE_IDENTIFIER.test(evidence.planId)) throw new ChapterRenderError("CHAPTER_RENDER_PLAN_ID_INVALID");
  if (!HASH_PATTERN.test(evidence.planFingerprint)) throw new ChapterRenderError("CHAPTER_RENDER_PLAN_HASH_INVALID");
  if (!Array.isArray(evidence.sources) || evidence.sources.length === 0) {
    throw new ChapterRenderError("CHAPTER_RENDER_SOURCES_REQUIRED");
  }
  const ids = new Set<string>();
  for (const source of evidence.sources) {
    assertSourceEvidence(source);
    if (ids.has(source.artifactId)) throw new ChapterRenderError("CHAPTER_RENDER_SOURCE_DUPLICATE");
    ids.add(source.artifactId);
  }
  requireInteger(evidence.expectedDurationMs, 1, 7 * 24 * 60 * 60 * 1_000, "CHAPTER_RENDER_DURATION_INVALID");
  if (evidence.output.format !== "wav") throw new ChapterRenderError("CHAPTER_RENDER_OUTPUT_FORMAT_INVALID");
  requireInteger(evidence.output.sampleRateHz, 8_000, 384_000, "CHAPTER_RENDER_OUTPUT_RATE_INVALID");
  if (evidence.output.channels !== 1 && evidence.output.channels !== 2) {
    throw new ChapterRenderError("CHAPTER_RENDER_OUTPUT_CHANNELS_INVALID");
  }
  if (![16, 24, 32].includes(evidence.output.bitDepth)) {
    throw new ChapterRenderError("CHAPTER_RENDER_OUTPUT_DEPTH_INVALID");
  }
  if (!HASH_PATTERN.test(evidence.output.contentHash)) throw new ChapterRenderError("CHAPTER_RENDER_OUTPUT_HASH_INVALID");
  requireInteger(evidence.output.byteCount, 1, ABSOLUTE_MAXIMUM_OUTPUT_BYTES, "CHAPTER_RENDER_OUTPUT_SIZE_INVALID");
  if (evidence.output.mediaSignature !== "riff-wave") {
    throw new ChapterRenderError("CHAPTER_RENDER_OUTPUT_SIGNATURE_INVALID");
  }
  safeExecutableName(evidence.tool.executableName);
  versionLine(evidence.tool.versionLine);
  if (!HASH_PATTERN.test(evidence.tool.versionFingerprint)) {
    throw new ChapterRenderError("CHAPTER_RENDER_TOOL_VERSION_HASH_INVALID");
  }
  if (stableHash(evidence.tool.versionLine) !== evidence.tool.versionFingerprint) {
    throw new ChapterRenderError("CHAPTER_RENDER_TOOL_VERSION_MISMATCH");
  }
  if (!HASH_PATTERN.test(evidence.filterFingerprint)) throw new ChapterRenderError("CHAPTER_RENDER_FILTER_HASH_INVALID");
  if (!HASH_PATTERN.test(evidence.commandFingerprint)) throw new ChapterRenderError("CHAPTER_RENDER_COMMAND_HASH_INVALID");
  if (Number.isNaN(Date.parse(evidence.renderedAt))) throw new ChapterRenderError("CHAPTER_RENDER_DATE_INVALID");
  const { fingerprint, ...partial } = evidence;
  if (evidenceFingerprint(partial) !== fingerprint) {
    throw new ChapterRenderError("CHAPTER_RENDER_FINGERPRINT_MISMATCH");
  }
}

function signalReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new ChapterRenderError("CHAPTER_RENDER_ABORTED");
}

async function spawnBounded(input: Readonly<{
  executable: string;
  args: readonly string[];
  timeoutMs: number;
  maximumOutputBytes: number;
  signal?: AbortSignal;
}>): Promise<Readonly<{ stdout: string; stderr: string }>> {
  if (input.signal?.aborted) throw signalReason(input.signal);
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
      rejectPromise(new ChapterRenderError(code));
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
    child.once("error", () => finishError("CHAPTER_RENDER_EXECUTABLE_UNAVAILABLE"));
    child.once("close", (exitCode) => {
      if (settled) return;
      if (aborted) return finishError("CHAPTER_RENDER_ABORTED");
      if (timedOut) return finishError("CHAPTER_RENDER_TIMEOUT");
      if (exceeded) return finishError("CHAPTER_RENDER_PROCESS_OUTPUT_TOO_LARGE");
      if (exitCode !== 0) return finishError("CHAPTER_RENDER_COMMAND_FAILED");
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

export class NodeChapterRenderRunner implements ChapterRenderRunner {
  readonly #ffmpegPath: string;
  readonly #temporaryRoot: string;

  constructor(input: Readonly<{ ffmpegPath?: string; temporaryRoot?: string }> = {}) {
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

  async render(request: ChapterRenderRequest, signal?: AbortSignal): Promise<Uint8Array> {
    requireInteger(request.timeoutMs, 100, 60 * 60_000, "CHAPTER_RENDER_TIMEOUT_INVALID");
    requireInteger(request.maximumOutputBytes, 1, ABSOLUTE_MAXIMUM_OUTPUT_BYTES, "CHAPTER_RENDER_OUTPUT_LIMIT_INVALID");
    if (!Array.isArray(request.sourcePaths) || request.sourcePaths.length === 0 || request.sourcePaths.length > 20_000) {
      throw new ChapterRenderError("CHAPTER_RENDER_SOURCE_PATHS_INVALID");
    }
    for (const path of request.sourcePaths) {
      if (!path.trim() || path.includes("\0")) throw new ChapterRenderError("CHAPTER_RENDER_PRIVATE_PATH_INVALID");
    }
    if (!request.filterScript.trim() || request.filterScript.length > 16 * 1024 * 1024) {
      throw new ChapterRenderError("CHAPTER_RENDER_FILTER_INVALID");
    }
    await mkdir(this.#temporaryRoot, { recursive: true, mode: 0o700 });
    const directory = await mkdtemp(join(this.#temporaryRoot, "storyteller-chapter-render-"));
    const filterPath = join(directory, "filter.ffscript");
    const outputPath = join(directory, "chapter.wav");
    try {
      const handle = await open(filterPath, "wx", 0o600);
      try {
        await handle.writeFile(request.filterScript, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
      const args = ["-nostdin", "-hide_banner", "-loglevel", "error", "-y"];
      for (const sourcePath of request.sourcePaths) args.push("-i", sourcePath);
      args.push(
        "-filter_complex_script",
        filterPath,
        "-map",
        "[out]",
        "-ar",
        String(request.sampleRateHz),
        "-ac",
        String(request.channels),
        "-c:a",
        codecFor(request.bitDepth),
        outputPath,
      );
      await spawnBounded({
        executable: this.#ffmpegPath,
        args,
        timeoutMs: request.timeoutMs,
        maximumOutputBytes: 8 * 1024 * 1024,
        ...(signal ? { signal } : {}),
      });
      const buffer = await readFile(outputPath);
      if (buffer.byteLength === 0 || buffer.byteLength > request.maximumOutputBytes) {
        throw new ChapterRenderError("CHAPTER_RENDER_OUTPUT_SIZE_INVALID");
      }
      return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    } catch (error) {
      if (error instanceof ChapterRenderError) throw error;
      throw new ChapterRenderError("CHAPTER_RENDER_EXECUTION_FAILED");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}

function commandFingerprint(plan: ChapterAssemblyPlan, filterScript: string): string {
  return stableHash({
    planFingerprint: plan.fingerprint,
    sourceCount: plan.segments.length,
    filterFingerprint: stableHash(filterScript),
    output: plan.output,
    expectedDurationMs: plan.renderedDurationMs,
    codec: codecFor(plan.output.bitDepth),
    shell: false,
  });
}

export async function renderChapterAssembly(
  input: RenderChapterAssemblyInput,
): Promise<ChapterRenderResult> {
  assertChapterAssemblyPlan(input.plan);
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maximumOutputBytes = input.maximumOutputBytes ?? DEFAULT_MAXIMUM_OUTPUT_BYTES;
  requireInteger(timeoutMs, 100, 60 * 60_000, "CHAPTER_RENDER_TIMEOUT_INVALID");
  requireInteger(maximumOutputBytes, 1, ABSOLUTE_MAXIMUM_OUTPUT_BYTES, "CHAPTER_RENDER_OUTPUT_LIMIT_INVALID");
  const renderedAt = input.renderedAt ?? new Date();
  if (Number.isNaN(renderedAt.getTime())) throw new ChapterRenderError("CHAPTER_RENDER_DATE_INVALID");
  if (input.signal?.aborted) throw signalReason(input.signal);
  const resolved: ResolvedChapterSource[] = [];
  try {
    for (const segment of input.plan.segments) {
      const source = await input.sources.resolve(segment.audio, input.signal);
      if (
        source.artifactId !== segment.audio.id
        || source.contentHash !== segment.audio.contentHash
        || source.byteCount !== segment.audio.byteCount
      ) {
        throw new ChapterRenderError("CHAPTER_RENDER_SOURCE_INTEGRITY_MISMATCH");
      }
      if (!source.privatePath.trim() || source.privatePath.includes("\0")) {
        throw new ChapterRenderError("CHAPTER_RENDER_PRIVATE_PATH_INVALID");
      }
      resolved.push(source);
    }
    const filterScript = buildChapterFilterScript(input.plan);
    const runner = input.runner ?? new NodeChapterRenderRunner({
      ...(input.ffmpegPath ? { ffmpegPath: input.ffmpegPath } : {}),
      ...(input.temporaryRoot ? { temporaryRoot: input.temporaryRoot } : {}),
    });
    const toolVersionLine = versionLine(await runner.inspectVersion(input.signal));
    const bytes = await runner.render({
      sourcePaths: resolved.map((source) => source.privatePath),
      filterScript,
      sampleRateHz: input.plan.output.sampleRateHz,
      channels: input.plan.output.channels,
      bitDepth: input.plan.output.bitDepth,
      expectedDurationMs: input.plan.renderedDurationMs,
      timeoutMs,
      maximumOutputBytes,
    }, input.signal);
    if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0 || bytes.byteLength > maximumOutputBytes) {
      throw new ChapterRenderError("CHAPTER_RENDER_OUTPUT_SIZE_INVALID");
    }
    const media = detectArtifactMedia(bytes);
    if (media.format !== "wav" || media.mimeType !== "audio/wav" || media.signature !== "riff-wave") {
      throw new ChapterRenderError("CHAPTER_RENDER_OUTPUT_MEDIA_INVALID");
    }
    const filterFingerprint = stableHash(filterScript);
    const partial: Omit<ChapterRenderEvidence, "fingerprint"> = {
      schemaVersion: CHAPTER_RENDER_SCHEMA_VERSION,
      id: `render_${stableHash({ plan: input.plan.fingerprint, output: hashBytes(bytes) }).slice(0, 24)}`,
      planId: input.plan.id,
      planFingerprint: input.plan.fingerprint,
      sources: Object.freeze(input.plan.segments.map((segment) => Object.freeze({
        artifactId: segment.audio.id,
        artifactFingerprint: segment.audio.fingerprint,
        contentHash: segment.audio.contentHash,
        byteCount: segment.audio.byteCount,
      }))),
      expectedDurationMs: input.plan.renderedDurationMs,
      output: Object.freeze({
        format: "wav",
        sampleRateHz: input.plan.output.sampleRateHz,
        channels: input.plan.output.channels,
        bitDepth: input.plan.output.bitDepth,
        contentHash: hashBytes(bytes),
        byteCount: bytes.byteLength,
        mediaSignature: media.signature,
      }),
      tool: Object.freeze({
        executableName: safeExecutableName(input.ffmpegPath ?? "ffmpeg"),
        versionLine: toolVersionLine,
        versionFingerprint: stableHash(toolVersionLine),
      }),
      filterFingerprint,
      commandFingerprint: commandFingerprint(input.plan, filterScript),
      renderedAt: renderedAt.toISOString(),
    };
    const evidence = Object.freeze({
      ...partial,
      fingerprint: evidenceFingerprint(partial),
    });
    assertChapterRenderEvidence(evidence);
    return Object.freeze({ evidence, bytes });
  } catch (error) {
    if (error instanceof ChapterRenderError) throw error;
    throw new ChapterRenderError("CHAPTER_RENDER_FAILED");
  } finally {
    await Promise.allSettled(resolved.map(async (source) => await source.dispose()));
  }
}

export function chapterRenderPublicView(
  evidence: ChapterRenderEvidence,
): ChapterRenderPublicView {
  assertChapterRenderEvidence(evidence);
  return Object.freeze({
    id: evidence.id,
    planId: evidence.planId,
    planFingerprint: evidence.planFingerprint,
    sourceCount: evidence.sources.length,
    expectedDurationMs: evidence.expectedDurationMs,
    output: evidence.output,
    toolVersionFingerprint: evidence.tool.versionFingerprint,
    filterFingerprint: evidence.filterFingerprint,
    renderedAt: evidence.renderedAt,
    fingerprint: evidence.fingerprint,
  });
}
