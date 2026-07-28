import { createHash } from "node:crypto";
import { basename } from "node:path";
import {
  NodeChapterRenderRunner,
  type ChapterRenderRequest,
  type ChapterRenderRunner,
} from "./chapter-render.js";
import {
  assertAudiobookSequence,
  type AudiobookSequence,
  type AudiobookSequenceArtifactSnapshot,
} from "./audiobook-sequence.js";
import { stableHash } from "./index.js";
import { detectArtifactMedia } from "./private-object-store.js";

export const AUDIOBOOK_RENDER_SCHEMA_VERSION =
  "storyteller-audiobook-render-v1" as const;

export interface ResolvedAudiobookSource {
  artifactId: string;
  privatePath: string;
  contentHash: string;
  byteCount: number;
  dispose(): Promise<void>;
}

export interface AudiobookSourceResolver {
  resolve(
    snapshot: AudiobookSequenceArtifactSnapshot,
    signal?: AbortSignal,
  ): Promise<ResolvedAudiobookSource>;
}

export interface AudiobookRenderSourceEvidence {
  ordinal: number;
  artifactId: string;
  artifactFingerprint: string;
  contentHash: string;
  byteCount: number;
}

export interface AudiobookRenderEvidence {
  schemaVersion: typeof AUDIOBOOK_RENDER_SCHEMA_VERSION;
  id: string;
  sequenceId: string;
  sequenceRevision: number;
  sequenceFingerprint: string;
  sources: readonly AudiobookRenderSourceEvidence[];
  expectedDurationMs: number;
  estimatedPcmByteCount: number;
  output: Readonly<{
    format: "wav";
    sampleRateHz: number;
    channels: 1 | 2;
    bitDepth: 16 | 24 | 32;
    contentHash: string;
    byteCount: number;
    mediaSignature: "riff-wave";
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

export interface AudiobookRenderResult {
  evidence: AudiobookRenderEvidence;
  bytes: Uint8Array;
}

export interface AudiobookRenderPublicView {
  id: string;
  sequenceId: string;
  sequenceRevision: number;
  sequenceFingerprint: string;
  sourceCount: number;
  expectedDurationMs: number;
  estimatedPcmByteCount: number;
  output: AudiobookRenderEvidence["output"];
  toolVersionFingerprint: string;
  filterFingerprint: string;
  renderedAt: string;
  fingerprint: string;
}

export interface RenderAudiobookSequenceInput {
  sequence: AudiobookSequence;
  sources: AudiobookSourceResolver;
  runner?: ChapterRenderRunner;
  ffmpegPath?: string;
  temporaryRoot?: string;
  timeoutMs?: number;
  maximumOutputBytes?: number;
  renderedAt?: Date;
  signal?: AbortSignal;
}

export class AudiobookRenderError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "AudiobookRenderError";
    this.code = code;
  }
}

const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const DEFAULT_TIMEOUT_MS = 60 * 60_000;
const RIFF_HEADER_RESERVE_BYTES = 4_096;
export const RIFF_MAXIMUM_OUTPUT_BYTES = 0xffff_ffff;
const DEFAULT_MAXIMUM_OUTPUT_BYTES = RIFF_MAXIMUM_OUTPUT_BYTES;
const ABSOLUTE_MAXIMUM_OUTPUT_BYTES = RIFF_MAXIMUM_OUTPUT_BYTES;

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
    throw new AudiobookRenderError(code);
  }
  return value;
}

function estimatePcmByteCount(input: Readonly<{
  durationMs: number;
  sampleRateHz: number;
  channels: 1 | 2;
  bitDepth: 16 | 24 | 32;
}>): number {
  const frames = Math.ceil((input.durationMs * input.sampleRateHz) / 1_000);
  const bytesPerSample = input.bitDepth / 8;
  return requireInteger(
    frames * input.channels * bytesPerSample + RIFF_HEADER_RESERVE_BYTES,
    1,
    Number.MAX_SAFE_INTEGER,
    "AUDIOBOOK_RENDER_ESTIMATED_SIZE_INVALID",
  );
}

export function estimateAudiobookPcmByteCount(
  sequence: AudiobookSequence,
): number {
  assertAudiobookSequence(sequence);
  return estimatePcmByteCount({
    durationMs: sequence.totalDurationMs,
    sampleRateHz: sequence.output.sampleRateHz,
    channels: sequence.output.channels,
    bitDepth: sequence.output.bitDepth,
  });
}

function safeExecutableName(value: string): string {
  const name = basename(value.trim());
  if (!name || name.length > 200 || CONTROL_CHARACTERS.test(name)) {
    throw new AudiobookRenderError("AUDIOBOOK_RENDER_EXECUTABLE_INVALID");
  }
  return name;
}

function versionLine(value: string): string {
  const line = value.split(/\r?\n/u).map((part) => part.trim()).find(Boolean);
  if (!line || line.length > 500 || CONTROL_CHARACTERS.test(line)) {
    throw new AudiobookRenderError("AUDIOBOOK_RENDER_TOOL_VERSION_INVALID");
  }
  return line;
}

function evidenceFingerprint(
  evidence: Omit<AudiobookRenderEvidence, "fingerprint">,
): string {
  return stableHash(evidence);
}

export function buildAudiobookFilterScript(sequence: AudiobookSequence): string {
  assertAudiobookSequence(sequence);
  const inputs = sequence.components
    .map((_, index) => `[${index}:a]`)
    .join("");
  return `${inputs}concat=n=${sequence.components.length}:v=0:a=1[out]\n`;
}

function commandFingerprint(
  sequence: AudiobookSequence,
  filterScript: string,
): string {
  return stableHash({
    sequenceFingerprint: sequence.fingerprint,
    sequenceRevision: sequence.revision,
    sourceCount: sequence.components.length,
    filterFingerprint: stableHash(filterScript),
    output: sequence.output,
    expectedDurationMs: sequence.totalDurationMs,
    estimatedPcmByteCount: estimateAudiobookPcmByteCount(sequence),
    shell: false,
  });
}

function assertSourceEvidence(source: AudiobookRenderSourceEvidence): void {
  requireInteger(source.ordinal, 1, 2_002, "AUDIOBOOK_RENDER_SOURCE_ORDINAL_INVALID");
  if (!SAFE_IDENTIFIER.test(source.artifactId)) {
    throw new AudiobookRenderError("AUDIOBOOK_RENDER_SOURCE_ID_INVALID");
  }
  if (!HASH_PATTERN.test(source.artifactFingerprint)) {
    throw new AudiobookRenderError("AUDIOBOOK_RENDER_SOURCE_FINGERPRINT_INVALID");
  }
  if (!HASH_PATTERN.test(source.contentHash)) {
    throw new AudiobookRenderError("AUDIOBOOK_RENDER_SOURCE_HASH_INVALID");
  }
  requireInteger(
    source.byteCount,
    1,
    Number.MAX_SAFE_INTEGER,
    "AUDIOBOOK_RENDER_SOURCE_SIZE_INVALID",
  );
}

export function assertAudiobookRenderEvidence(
  evidence: AudiobookRenderEvidence,
): void {
  if (evidence.schemaVersion !== AUDIOBOOK_RENDER_SCHEMA_VERSION) {
    throw new AudiobookRenderError("AUDIOBOOK_RENDER_SCHEMA_UNSUPPORTED");
  }
  if (!SAFE_IDENTIFIER.test(evidence.id)) {
    throw new AudiobookRenderError("AUDIOBOOK_RENDER_ID_INVALID");
  }
  if (!SAFE_IDENTIFIER.test(evidence.sequenceId)) {
    throw new AudiobookRenderError("AUDIOBOOK_RENDER_SEQUENCE_ID_INVALID");
  }
  requireInteger(
    evidence.sequenceRevision,
    1,
    Number.MAX_SAFE_INTEGER,
    "AUDIOBOOK_RENDER_SEQUENCE_REVISION_INVALID",
  );
  if (!HASH_PATTERN.test(evidence.sequenceFingerprint)) {
    throw new AudiobookRenderError("AUDIOBOOK_RENDER_SEQUENCE_HASH_INVALID");
  }
  if (!Array.isArray(evidence.sources) || evidence.sources.length < 3) {
    throw new AudiobookRenderError("AUDIOBOOK_RENDER_SOURCES_REQUIRED");
  }
  const ids = new Set<string>();
  for (const [index, source] of evidence.sources.entries()) {
    assertSourceEvidence(source);
    if (source.ordinal !== index + 1) {
      throw new AudiobookRenderError("AUDIOBOOK_RENDER_SOURCE_ORDER_INVALID");
    }
    if (ids.has(source.artifactId)) {
      throw new AudiobookRenderError("AUDIOBOOK_RENDER_SOURCE_DUPLICATE");
    }
    ids.add(source.artifactId);
  }
  requireInteger(
    evidence.expectedDurationMs,
    1,
    15 * 24 * 60 * 60 * 1_000,
    "AUDIOBOOK_RENDER_DURATION_INVALID",
  );
  requireInteger(
  evidence.estimatedPcmByteCount,
  1,
  RIFF_MAXIMUM_OUTPUT_BYTES,
  "AUDIOBOOK_RENDER_ESTIMATED_SIZE_INVALID",
);
if (evidence.output.format !== "wav") {
    throw new AudiobookRenderError("AUDIOBOOK_RENDER_OUTPUT_FORMAT_INVALID");
  }
  requireInteger(
    evidence.output.sampleRateHz,
    8_000,
    384_000,
    "AUDIOBOOK_RENDER_OUTPUT_RATE_INVALID",
  );
  if (evidence.output.channels !== 1 && evidence.output.channels !== 2) {
    throw new AudiobookRenderError("AUDIOBOOK_RENDER_OUTPUT_CHANNELS_INVALID");
  }
  if (![16, 24, 32].includes(evidence.output.bitDepth)) {
    throw new AudiobookRenderError("AUDIOBOOK_RENDER_OUTPUT_DEPTH_INVALID");
  }
  if (!HASH_PATTERN.test(evidence.output.contentHash)) {
    throw new AudiobookRenderError("AUDIOBOOK_RENDER_OUTPUT_HASH_INVALID");
  }
  requireInteger(
    evidence.output.byteCount,
    1,
    ABSOLUTE_MAXIMUM_OUTPUT_BYTES,
    "AUDIOBOOK_RENDER_OUTPUT_SIZE_INVALID",
  );
  if (evidence.output.mediaSignature !== "riff-wave") {
    throw new AudiobookRenderError("AUDIOBOOK_RENDER_OUTPUT_SIGNATURE_INVALID");
  }
  const expectedEstimate = estimatePcmByteCount({
  durationMs: evidence.expectedDurationMs,
  sampleRateHz: evidence.output.sampleRateHz,
  channels: evidence.output.channels,
  bitDepth: evidence.output.bitDepth,
});
if (evidence.estimatedPcmByteCount !== expectedEstimate) {
  throw new AudiobookRenderError("AUDIOBOOK_RENDER_ESTIMATED_SIZE_MISMATCH");
}
safeExecutableName(evidence.tool.executableName);
  const checkedVersion = versionLine(evidence.tool.versionLine);
  if (
    !HASH_PATTERN.test(evidence.tool.versionFingerprint)
    || stableHash(checkedVersion) !== evidence.tool.versionFingerprint
  ) {
    throw new AudiobookRenderError("AUDIOBOOK_RENDER_TOOL_VERSION_MISMATCH");
  }
  for (const hash of [
    evidence.filterFingerprint,
    evidence.commandFingerprint,
  ]) {
    if (!HASH_PATTERN.test(hash)) {
      throw new AudiobookRenderError("AUDIOBOOK_RENDER_COMMAND_HASH_INVALID");
    }
  }
  if (Number.isNaN(Date.parse(evidence.renderedAt))) {
    throw new AudiobookRenderError("AUDIOBOOK_RENDER_DATE_INVALID");
  }
  const { fingerprint, ...partial } = evidence;
  if (!HASH_PATTERN.test(fingerprint) || evidenceFingerprint(partial) !== fingerprint) {
    throw new AudiobookRenderError("AUDIOBOOK_RENDER_FINGERPRINT_INVALID");
  }
}

function signalReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new AudiobookRenderError("AUDIOBOOK_RENDER_ABORTED");
}

export async function renderAudiobookSequence(
  input: RenderAudiobookSequenceInput,
): Promise<AudiobookRenderResult> {
  assertAudiobookSequence(input.sequence);
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maximumOutputBytes = input.maximumOutputBytes ?? DEFAULT_MAXIMUM_OUTPUT_BYTES;
  requireInteger(timeoutMs, 100, 4 * 60 * 60_000, "AUDIOBOOK_RENDER_TIMEOUT_INVALID");
  requireInteger(
    maximumOutputBytes,
    1,
    ABSOLUTE_MAXIMUM_OUTPUT_BYTES,
    "AUDIOBOOK_RENDER_OUTPUT_LIMIT_INVALID",
  );
  const estimatedPcmByteCount = estimateAudiobookPcmByteCount(input.sequence);
if (estimatedPcmByteCount > maximumOutputBytes) {
  throw new AudiobookRenderError("AUDIOBOOK_RENDER_RIFF_CAPACITY_EXCEEDED");
}
const renderedAt = input.renderedAt ?? new Date();
  if (Number.isNaN(renderedAt.getTime())) {
    throw new AudiobookRenderError("AUDIOBOOK_RENDER_DATE_INVALID");
  }
  if (renderedAt.getTime() < Date.parse(input.sequence.updatedAt)) {
    throw new AudiobookRenderError("AUDIOBOOK_RENDER_PRECEDES_SEQUENCE");
  }
  if (input.signal?.aborted) throw signalReason(input.signal);
  const resolved: ResolvedAudiobookSource[] = [];
  try {
    for (const entry of input.sequence.components) {
      const source = await input.sources.resolve(entry.artifact, input.signal);
      resolved.push(source);
      if (
        source.artifactId !== entry.artifact.id
        || source.contentHash !== entry.artifact.contentHash
        || source.byteCount !== entry.artifact.byteCount
      ) {
        throw new AudiobookRenderError("AUDIOBOOK_RENDER_SOURCE_INTEGRITY_MISMATCH");
      }
      if (!source.privatePath.trim() || source.privatePath.includes("\0")) {
        throw new AudiobookRenderError("AUDIOBOOK_RENDER_PRIVATE_PATH_INVALID");
      }
    }
    const filterScript = buildAudiobookFilterScript(input.sequence);
    const runner = input.runner ?? new NodeChapterRenderRunner({
      ...(input.ffmpegPath ? { ffmpegPath: input.ffmpegPath } : {}),
      ...(input.temporaryRoot ? { temporaryRoot: input.temporaryRoot } : {}),
    });
    const checkedVersionLine = versionLine(await runner.inspectVersion(input.signal));
    const request: ChapterRenderRequest = {
      sourcePaths: resolved.map((source) => source.privatePath),
      filterScript,
      sampleRateHz: input.sequence.output.sampleRateHz,
      channels: input.sequence.output.channels,
      bitDepth: input.sequence.output.bitDepth,
      expectedDurationMs: input.sequence.totalDurationMs,
      timeoutMs,
      maximumOutputBytes,
    };
    const bytes = await runner.render(request, input.signal);
    if (
      !(bytes instanceof Uint8Array)
      || bytes.byteLength === 0
      || bytes.byteLength > maximumOutputBytes
    ) {
      throw new AudiobookRenderError("AUDIOBOOK_RENDER_OUTPUT_SIZE_INVALID");
    }
    let media: ReturnType<typeof detectArtifactMedia>;
try {
  media = detectArtifactMedia(bytes);
} catch {
  throw new AudiobookRenderError("AUDIOBOOK_RENDER_OUTPUT_MEDIA_INVALID");
}
if (
      media.format !== "wav"
      || media.mimeType !== "audio/wav"
      || media.signature !== "riff-wave"
    ) {
      throw new AudiobookRenderError("AUDIOBOOK_RENDER_OUTPUT_MEDIA_INVALID");
    }
    const filterFingerprint = stableHash(filterScript);
    const outputHash = hashBytes(bytes);
    const partial: Omit<AudiobookRenderEvidence, "fingerprint"> = {
      schemaVersion: AUDIOBOOK_RENDER_SCHEMA_VERSION,
      id: `audiobook_render_${stableHash({
        sequence: input.sequence.fingerprint,
        output: outputHash,
      }).slice(0, 24)}`,
      sequenceId: input.sequence.id,
      sequenceRevision: input.sequence.revision,
      sequenceFingerprint: input.sequence.fingerprint,
      sources: Object.freeze(input.sequence.components.map((entry) => Object.freeze({
        ordinal: entry.ordinal,
        artifactId: entry.artifact.id,
        artifactFingerprint: entry.artifact.fingerprint,
        contentHash: entry.artifact.contentHash,
        byteCount: entry.artifact.byteCount,
      }))),
      expectedDurationMs: input.sequence.totalDurationMs,
      estimatedPcmByteCount,
      output: Object.freeze({
        format: "wav",
        sampleRateHz: input.sequence.output.sampleRateHz,
        channels: input.sequence.output.channels,
        bitDepth: input.sequence.output.bitDepth,
        contentHash: outputHash,
        byteCount: bytes.byteLength,
        mediaSignature: "riff-wave",
      }),
      tool: Object.freeze({
        executableName: safeExecutableName(input.ffmpegPath ?? "ffmpeg"),
        versionLine: checkedVersionLine,
        versionFingerprint: stableHash(checkedVersionLine),
      }),
      filterFingerprint,
      commandFingerprint: commandFingerprint(input.sequence, filterScript),
      renderedAt: renderedAt.toISOString(),
    };
    const evidence = Object.freeze({
      ...partial,
      fingerprint: evidenceFingerprint(partial),
    });
    assertAudiobookRenderEvidence(evidence);
    return Object.freeze({ evidence, bytes });
  } catch (error) {
    if (error instanceof AudiobookRenderError) throw error;
    if (error instanceof Error && error.message === "CHAPTER_RENDER_ABORTED") {
      throw new AudiobookRenderError("AUDIOBOOK_RENDER_ABORTED");
    }
    throw new AudiobookRenderError("AUDIOBOOK_RENDER_FAILED");
  } finally {
    await Promise.allSettled(resolved.map(async (source) => await source.dispose()));
  }
}

export function audiobookRenderPublicView(
  evidence: AudiobookRenderEvidence,
): AudiobookRenderPublicView {
  assertAudiobookRenderEvidence(evidence);
  return Object.freeze({
    id: evidence.id,
    sequenceId: evidence.sequenceId,
    sequenceRevision: evidence.sequenceRevision,
    sequenceFingerprint: evidence.sequenceFingerprint,
    sourceCount: evidence.sources.length,
    expectedDurationMs: evidence.expectedDurationMs,
    estimatedPcmByteCount: evidence.estimatedPcmByteCount,
    output: evidence.output,
    toolVersionFingerprint: evidence.tool.versionFingerprint,
    filterFingerprint: evidence.filterFingerprint,
    renderedAt: evidence.renderedAt,
    fingerprint: evidence.fingerprint,
  });
}
