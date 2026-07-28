import { createHash } from "node:crypto";
import { basename } from "node:path";
import {
  assertAudiobookRetailSamplePlan,
  type AudiobookRetailSamplePlan,
  type AudiobookRetailSampleSourceRole,
} from "./audiobook-retail-sample-plan.js";
import {
  NodeAudiobookRetailTrackRenderRunner,
  type AudiobookRetailTrackRenderRunner,
} from "./audiobook-retail-track-render.js";
import { stableHash } from "./index.js";
import { detectArtifactMedia } from "./private-object-store.js";

export const AUDIOBOOK_RETAIL_SAMPLE_RENDER_SCHEMA_VERSION =
  "storyteller-audiobook-retail-sample-render-v1" as const;

export interface ResolvedAudiobookRetailSampleSource {
  artifactId: string;
  artifactRevision: number;
  artifactFingerprint: string;
  privatePath: string;
  contentHash: string;
  byteCount: number;
  dispose(): Promise<void>;
}

export interface AudiobookRetailSampleSourceResolver {
  resolve(
    snapshot: AudiobookRetailSamplePlan["source"],
    signal?: AbortSignal,
  ): Promise<ResolvedAudiobookRetailSampleSource>;
}

export interface AudiobookRetailSampleRenderedOutput {
  fileName: "RetailSample.mp3";
  format: "mp3";
  codec: "mp3";
  encoder: "libmp3lame";
  bitRateMode: "cbr";
  bitRateKbps: 192 | 256 | 320;
  sampleRateHz: 44_100;
  channels: 1 | 2;
  contentHash: string;
  byteCount: number;
  mediaSignature: "mpeg-audio";
}

export interface AudiobookRetailSampleRenderEvidence {
  schemaVersion: typeof AUDIOBOOK_RETAIL_SAMPLE_RENDER_SCHEMA_VERSION;
  id: string;
  projectId: string;
  bookId: string;
  planId: string;
  planFingerprint: string;
  source: Readonly<{
    trackOrdinal: number;
    role: AudiobookRetailSampleSourceRole;
    fileName: string;
    artifactId: string;
    artifactRevision: number;
    artifactFingerprint: string;
    contentHash: string;
    byteCount: number;
  }>;
  range: AudiobookRetailSamplePlan["range"];
  output: AudiobookRetailSampleRenderedOutput;
  filterFingerprint: string;
  commandFingerprint: string;
  tool: Readonly<{
    executableName: string;
    versionLine: string;
    versionFingerprint: string;
  }>;
  renderedAt: string;
  fingerprint: string;
}

export interface AudiobookRetailSampleRenderResult {
  evidence: AudiobookRetailSampleRenderEvidence;
  bytes: Uint8Array;
}

export interface AudiobookRetailSampleRenderPublicView {
  id: string;
  bookId: string;
  planId: string;
  sourceTrackOrdinal: number;
  sourceRole: AudiobookRetailSampleSourceRole;
  sourceFileName: string;
  relativeStartMs: number;
  relativeEndMs: number;
  durationMs: number;
  absoluteBookStartMs: number;
  absoluteBookEndMs: number;
  output: AudiobookRetailSampleRenderedOutput;
  toolVersionFingerprint: string;
  renderedAt: string;
  fingerprint: string;
}

export interface RenderAudiobookRetailSampleInput {
  plan: AudiobookRetailSamplePlan;
  source: AudiobookRetailSampleSourceResolver;
  runner?: AudiobookRetailTrackRenderRunner;
  ffmpegPath?: string;
  temporaryRoot?: string;
  timeoutMs?: number;
  maximumOutputBytes?: number;
  renderedAt?: Date;
  signal?: AbortSignal;
}

export class AudiobookRetailSampleRenderError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "AudiobookRetailSampleRenderError";
    this.code = code;
  }
}

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const SOURCE_FILE_NAME_PATTERN = /^[A-Za-z0-9]+\.mp3$/u;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const DEFAULT_TIMEOUT_MS = 20 * 60_000;
const MAXIMUM_TIMEOUT_MS = 60 * 60_000;
const DEFAULT_MAXIMUM_OUTPUT_BYTES = 64 * 1024 * 1024;
const ABSOLUTE_MAXIMUM_OUTPUT_BYTES = 512 * 1024 * 1024;
const ENCODED_SIZE_OVERHEAD_BYTES = 2 * 1024 * 1024;

function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function requireIdentifier(value: string, code: string): string {
  if (!SAFE_IDENTIFIER.test(value)) {
    throw new AudiobookRetailSampleRenderError(code);
  }
  return value;
}

function requireHash(value: string, code: string): string {
  if (!HASH_PATTERN.test(value)) {
    throw new AudiobookRetailSampleRenderError(code);
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
    throw new AudiobookRetailSampleRenderError(code);
  }
  return value;
}

function requireDate(value: string, code: string): string {
  if (!value || Number.isNaN(Date.parse(value))) {
    throw new AudiobookRetailSampleRenderError(code);
  }
  return value;
}

function safeExecutableName(value: string): string {
  const name = basename(value.trim());
  if (
    !name
    || name.length > 200
    || CONTROL_CHARACTERS.test(name)
    || /[\r\n]/u.test(name)
  ) {
    throw new AudiobookRetailSampleRenderError(
      "AUDIOBOOK_RETAIL_SAMPLE_RENDER_EXECUTABLE_INVALID",
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
    throw new AudiobookRetailSampleRenderError(
      "AUDIOBOOK_RETAIL_SAMPLE_RENDER_TOOL_VERSION_INVALID",
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

function isNarrativeRole(
  value: string,
): value is AudiobookRetailSampleSourceRole {
  return value === "prologue" || value === "chapter" || value === "epilogue";
}

export function buildAudiobookRetailSampleFilter(
  plan: AudiobookRetailSamplePlan,
): string {
  assertAudiobookRetailSamplePlan(plan);
  return [
    `atrim=start=${seconds(plan.range.relativeStartMs)}:duration=${seconds(plan.range.durationMs)}`,
    "asetpts=PTS-STARTPTS",
    `aformat=sample_rates=${plan.output.sampleRateHz}:channel_layouts=${channelLayout(plan.output.channels)}`,
  ].join(",") + "\n";
}

function estimatedMaximumEncodedBytes(
  plan: AudiobookRetailSamplePlan,
): number {
  const payload = Math.ceil(
    (plan.range.durationMs / 1_000)
      * plan.output.bitRateKbps
      * 1_000
      / 8,
  );
  return requireInteger(
    payload + ENCODED_SIZE_OVERHEAD_BYTES,
    1,
    Number.MAX_SAFE_INTEGER,
    "AUDIOBOOK_RETAIL_SAMPLE_RENDER_ESTIMATED_SIZE_INVALID",
  );
}

function commandFingerprint(
  plan: AudiobookRetailSamplePlan,
  filterScript: string,
): string {
  return stableHash({
    planFingerprint: plan.fingerprint,
    sourceArtifactFingerprint: plan.source.approvedArtifactFingerprint,
    sourceContentHash: plan.source.approvedArtifactContentHash,
    sourceTrackOrdinal: plan.source.trackOrdinal,
    range: plan.range,
    filterFingerprint: stableHash(filterScript),
    output: plan.output,
    encoder: "libmp3lame",
    metadata: "stripped",
    shell: false,
  });
}

function evidenceFingerprint(
  value: Omit<AudiobookRetailSampleRenderEvidence, "fingerprint">,
): string {
  return stableHash(value);
}

function assertResolvedSource(
  plan: AudiobookRetailSamplePlan,
  source: ResolvedAudiobookRetailSampleSource,
): void {
  if (
    source.artifactId !== plan.source.approvedArtifactId
    || source.artifactRevision !== plan.source.approvedArtifactRevision
    || source.artifactFingerprint !== plan.source.approvedArtifactFingerprint
    || source.contentHash !== plan.source.approvedArtifactContentHash
    || source.byteCount !== plan.source.approvedArtifactByteCount
  ) {
    throw new AudiobookRetailSampleRenderError(
      "AUDIOBOOK_RETAIL_SAMPLE_RENDER_SOURCE_INTEGRITY_MISMATCH",
    );
  }
  if (!source.privatePath.trim() || source.privatePath.includes("\0")) {
    throw new AudiobookRetailSampleRenderError(
      "AUDIOBOOK_RETAIL_SAMPLE_RENDER_PRIVATE_PATH_INVALID",
    );
  }
}

function assertOutput(
  output: AudiobookRetailSampleRenderedOutput,
): void {
  if (
    output.fileName !== "RetailSample.mp3"
    || output.format !== "mp3"
    || output.codec !== "mp3"
    || output.encoder !== "libmp3lame"
    || output.bitRateMode !== "cbr"
    || ![192, 256, 320].includes(output.bitRateKbps)
    || output.sampleRateHz !== 44_100
    || (output.channels !== 1 && output.channels !== 2)
    || output.mediaSignature !== "mpeg-audio"
  ) {
    throw new AudiobookRetailSampleRenderError(
      "AUDIOBOOK_RETAIL_SAMPLE_RENDER_OUTPUT_PROFILE_INVALID",
    );
  }
  requireHash(
    output.contentHash,
    "AUDIOBOOK_RETAIL_SAMPLE_RENDER_OUTPUT_HASH_INVALID",
  );
  requireInteger(
    output.byteCount,
    1,
    ABSOLUTE_MAXIMUM_OUTPUT_BYTES,
    "AUDIOBOOK_RETAIL_SAMPLE_RENDER_OUTPUT_SIZE_INVALID",
  );
}

export function assertAudiobookRetailSampleRenderEvidence(
  evidence: AudiobookRetailSampleRenderEvidence,
): void {
  if (
    evidence.schemaVersion !== AUDIOBOOK_RETAIL_SAMPLE_RENDER_SCHEMA_VERSION
  ) {
    throw new AudiobookRetailSampleRenderError(
      "AUDIOBOOK_RETAIL_SAMPLE_RENDER_SCHEMA_UNSUPPORTED",
    );
  }
  for (const [value, code] of [
    [evidence.id, "AUDIOBOOK_RETAIL_SAMPLE_RENDER_ID_INVALID"],
    [evidence.projectId, "AUDIOBOOK_RETAIL_SAMPLE_RENDER_PROJECT_ID_INVALID"],
    [evidence.bookId, "AUDIOBOOK_RETAIL_SAMPLE_RENDER_BOOK_ID_INVALID"],
    [evidence.planId, "AUDIOBOOK_RETAIL_SAMPLE_RENDER_PLAN_ID_INVALID"],
    [evidence.source.artifactId, "AUDIOBOOK_RETAIL_SAMPLE_RENDER_SOURCE_ID_INVALID"],
  ] as const) requireIdentifier(value, code);
  for (const [value, code] of [
    [evidence.planFingerprint, "AUDIOBOOK_RETAIL_SAMPLE_RENDER_PLAN_HASH_INVALID"],
    [
      evidence.source.artifactFingerprint,
      "AUDIOBOOK_RETAIL_SAMPLE_RENDER_SOURCE_FINGERPRINT_INVALID",
    ],
    [
      evidence.source.contentHash,
      "AUDIOBOOK_RETAIL_SAMPLE_RENDER_SOURCE_HASH_INVALID",
    ],
    [
      evidence.filterFingerprint,
      "AUDIOBOOK_RETAIL_SAMPLE_RENDER_FILTER_HASH_INVALID",
    ],
    [
      evidence.commandFingerprint,
      "AUDIOBOOK_RETAIL_SAMPLE_RENDER_COMMAND_HASH_INVALID",
    ],
    [
      evidence.tool.versionFingerprint,
      "AUDIOBOOK_RETAIL_SAMPLE_RENDER_TOOL_VERSION_HASH_INVALID",
    ],
  ] as const) requireHash(value, code);
  requireInteger(
    evidence.source.trackOrdinal,
    1,
    2_002,
    "AUDIOBOOK_RETAIL_SAMPLE_RENDER_SOURCE_ORDINAL_INVALID",
  );
  if (!isNarrativeRole(evidence.source.role)) {
    throw new AudiobookRetailSampleRenderError(
      "AUDIOBOOK_RETAIL_SAMPLE_RENDER_NARRATIVE_SOURCE_REQUIRED",
    );
  }
  if (!SOURCE_FILE_NAME_PATTERN.test(evidence.source.fileName)) {
    throw new AudiobookRetailSampleRenderError(
      "AUDIOBOOK_RETAIL_SAMPLE_RENDER_SOURCE_FILE_NAME_INVALID",
    );
  }
  requireInteger(
    evidence.source.artifactRevision,
    1,
    Number.MAX_SAFE_INTEGER,
    "AUDIOBOOK_RETAIL_SAMPLE_RENDER_SOURCE_REVISION_INVALID",
  );
  requireInteger(
    evidence.source.byteCount,
    1,
    Number.MAX_SAFE_INTEGER,
    "AUDIOBOOK_RETAIL_SAMPLE_RENDER_SOURCE_SIZE_INVALID",
  );
  requireInteger(
    evidence.range.relativeStartMs,
    0,
    7_200_000,
    "AUDIOBOOK_RETAIL_SAMPLE_RENDER_RANGE_INVALID",
  );
  requireInteger(
    evidence.range.relativeEndMs,
    evidence.range.relativeStartMs + 1,
    7_200_000,
    "AUDIOBOOK_RETAIL_SAMPLE_RENDER_RANGE_INVALID",
  );
  requireInteger(
    evidence.range.durationMs,
    1,
    300_000,
    "AUDIOBOOK_RETAIL_SAMPLE_RENDER_DURATION_INVALID",
  );
  requireInteger(
    evidence.range.absoluteBookStartMs,
    0,
    15 * 24 * 60 * 60 * 1_000,
    "AUDIOBOOK_RETAIL_SAMPLE_RENDER_ABSOLUTE_RANGE_INVALID",
  );
  requireInteger(
    evidence.range.absoluteBookEndMs,
    evidence.range.absoluteBookStartMs + 1,
    15 * 24 * 60 * 60 * 1_000,
    "AUDIOBOOK_RETAIL_SAMPLE_RENDER_ABSOLUTE_RANGE_INVALID",
  );
  if (
    evidence.range.relativeEndMs - evidence.range.relativeStartMs
      !== evidence.range.durationMs
    || evidence.range.absoluteBookEndMs - evidence.range.absoluteBookStartMs
      !== evidence.range.durationMs
  ) {
    throw new AudiobookRetailSampleRenderError(
      "AUDIOBOOK_RETAIL_SAMPLE_RENDER_RANGE_MISMATCH",
    );
  }
  assertOutput(evidence.output);
  const checkedVersion = versionLine(evidence.tool.versionLine);
  safeExecutableName(evidence.tool.executableName);
  if (stableHash(checkedVersion) !== evidence.tool.versionFingerprint) {
    throw new AudiobookRetailSampleRenderError(
      "AUDIOBOOK_RETAIL_SAMPLE_RENDER_TOOL_VERSION_MISMATCH",
    );
  }
  requireDate(
    evidence.renderedAt,
    "AUDIOBOOK_RETAIL_SAMPLE_RENDER_DATE_INVALID",
  );
  const { fingerprint, ...partial } = evidence;
  if (
    !HASH_PATTERN.test(fingerprint)
    || evidenceFingerprint(partial) !== fingerprint
  ) {
    throw new AudiobookRetailSampleRenderError(
      "AUDIOBOOK_RETAIL_SAMPLE_RENDER_FINGERPRINT_INVALID",
    );
  }
}

export function assertAudiobookRetailSampleRenderMatchesPlan(
  evidence: AudiobookRetailSampleRenderEvidence,
  plan: AudiobookRetailSamplePlan,
): void {
  assertAudiobookRetailSampleRenderEvidence(evidence);
  assertAudiobookRetailSamplePlan(plan);
  const filterScript = buildAudiobookRetailSampleFilter(plan);
  if (
    evidence.projectId !== plan.projectId
    || evidence.bookId !== plan.bookId
    || evidence.planId !== plan.id
    || evidence.planFingerprint !== plan.fingerprint
    || evidence.source.trackOrdinal !== plan.source.trackOrdinal
    || evidence.source.role !== plan.source.role
    || evidence.source.fileName !== plan.source.fileName
    || evidence.source.artifactId !== plan.source.approvedArtifactId
    || evidence.source.artifactRevision !== plan.source.approvedArtifactRevision
    || evidence.source.artifactFingerprint
      !== plan.source.approvedArtifactFingerprint
    || evidence.source.contentHash !== plan.source.approvedArtifactContentHash
    || evidence.source.byteCount !== plan.source.approvedArtifactByteCount
    || stableHash(evidence.range) !== stableHash(plan.range)
    || evidence.output.fileName !== plan.output.fileName
    || evidence.output.format !== plan.output.format
    || evidence.output.codec !== plan.output.codec
    || evidence.output.bitRateMode !== plan.output.bitRateMode
    || evidence.output.bitRateKbps !== plan.output.bitRateKbps
    || evidence.output.sampleRateHz !== plan.output.sampleRateHz
    || evidence.output.channels !== plan.output.channels
    || evidence.filterFingerprint !== stableHash(filterScript)
    || evidence.commandFingerprint !== commandFingerprint(plan, filterScript)
    || Date.parse(evidence.renderedAt) < Date.parse(plan.createdAt)
  ) {
    throw new AudiobookRetailSampleRenderError(
      "AUDIOBOOK_RETAIL_SAMPLE_RENDER_PLAN_SOURCE_MISMATCH",
    );
  }
}

export function assertAudiobookRetailSampleRenderResult(
  result: AudiobookRetailSampleRenderResult,
): void {
  assertAudiobookRetailSampleRenderEvidence(result.evidence);
  if (
    !(result.bytes instanceof Uint8Array)
    || result.bytes.byteLength !== result.evidence.output.byteCount
    || hashBytes(result.bytes) !== result.evidence.output.contentHash
  ) {
    throw new AudiobookRetailSampleRenderError(
      "AUDIOBOOK_RETAIL_SAMPLE_RENDER_RESULT_INTEGRITY_MISMATCH",
    );
  }
  let media;
  try {
    media = detectArtifactMedia(result.bytes);
  } catch {
    throw new AudiobookRetailSampleRenderError(
      "AUDIOBOOK_RETAIL_SAMPLE_RENDER_RESULT_MEDIA_MISMATCH",
    );
  }
  if (
    media.format !== "mp3"
    || media.mimeType !== "audio/mpeg"
    || media.signature !== result.evidence.output.mediaSignature
  ) {
    throw new AudiobookRetailSampleRenderError(
      "AUDIOBOOK_RETAIL_SAMPLE_RENDER_RESULT_MEDIA_MISMATCH",
    );
  }
}

function signalError(): AudiobookRetailSampleRenderError {
  return new AudiobookRetailSampleRenderError(
    "AUDIOBOOK_RETAIL_SAMPLE_RENDER_ABORTED",
  );
}

export async function renderAudiobookRetailSample(
  input: RenderAudiobookRetailSampleInput,
): Promise<AudiobookRetailSampleRenderResult> {
  assertAudiobookRetailSamplePlan(input.plan);
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maximumOutputBytes = input.maximumOutputBytes
    ?? DEFAULT_MAXIMUM_OUTPUT_BYTES;
  requireInteger(
    timeoutMs,
    100,
    MAXIMUM_TIMEOUT_MS,
    "AUDIOBOOK_RETAIL_SAMPLE_RENDER_TIMEOUT_INVALID",
  );
  requireInteger(
    maximumOutputBytes,
    1,
    ABSOLUTE_MAXIMUM_OUTPUT_BYTES,
    "AUDIOBOOK_RETAIL_SAMPLE_RENDER_OUTPUT_LIMIT_INVALID",
  );
  if (estimatedMaximumEncodedBytes(input.plan) > maximumOutputBytes) {
    throw new AudiobookRetailSampleRenderError(
      "AUDIOBOOK_RETAIL_SAMPLE_RENDER_ESTIMATED_SIZE_EXCEEDS_LIMIT",
    );
  }
  const renderedAt = input.renderedAt ?? new Date();
  if (
    Number.isNaN(renderedAt.getTime())
    || renderedAt.getTime() < Date.parse(input.plan.createdAt)
  ) {
    throw new AudiobookRetailSampleRenderError(
      "AUDIOBOOK_RETAIL_SAMPLE_RENDER_DATE_INVALID",
    );
  }
  if (input.signal?.aborted) throw signalError();

  let source: ResolvedAudiobookRetailSampleSource | undefined;
  try {
    source = await input.source.resolve(input.plan.source, input.signal);
    assertResolvedSource(input.plan, source);
    const runner = input.runner ?? new NodeAudiobookRetailTrackRenderRunner({
      ...(input.ffmpegPath ? { ffmpegPath: input.ffmpegPath } : {}),
      ...(input.temporaryRoot ? { temporaryRoot: input.temporaryRoot } : {}),
    });
    const checkedVersion = versionLine(
      await runner.inspectVersion(input.signal),
    );
    const filterScript = buildAudiobookRetailSampleFilter(input.plan);
    let bytes: Uint8Array;
    try {
      bytes = await runner.render({
        sourcePath: source.privatePath,
        sourceStartMs: input.plan.range.relativeStartMs,
        durationMs: input.plan.range.durationMs,
        filterScript,
        output: input.plan.output,
        timeoutMs,
        maximumOutputBytes,
      }, input.signal);
    } catch (error) {
      if (input.signal?.aborted) throw signalError();
      if (error instanceof AudiobookRetailSampleRenderError) throw error;
      throw new AudiobookRetailSampleRenderError(
        "AUDIOBOOK_RETAIL_SAMPLE_RENDER_RUNNER_FAILED",
      );
    }
    if (
      !(bytes instanceof Uint8Array)
      || bytes.byteLength === 0
      || bytes.byteLength > maximumOutputBytes
    ) {
      throw new AudiobookRetailSampleRenderError(
        "AUDIOBOOK_RETAIL_SAMPLE_RENDER_OUTPUT_SIZE_INVALID",
      );
    }
    let media;
    try {
      media = detectArtifactMedia(bytes);
    } catch {
      throw new AudiobookRetailSampleRenderError(
        "AUDIOBOOK_RETAIL_SAMPLE_RENDER_OUTPUT_MEDIA_INVALID",
      );
    }
    if (
      media.format !== "mp3"
      || media.mimeType !== "audio/mpeg"
      || media.signature !== "mpeg-audio"
    ) {
      throw new AudiobookRetailSampleRenderError(
        "AUDIOBOOK_RETAIL_SAMPLE_RENDER_OUTPUT_MEDIA_INVALID",
      );
    }
    const output: AudiobookRetailSampleRenderedOutput = Object.freeze({
      fileName: "RetailSample.mp3",
      format: "mp3",
      codec: "mp3",
      encoder: "libmp3lame",
      bitRateMode: "cbr",
      bitRateKbps: input.plan.output.bitRateKbps,
      sampleRateHz: 44_100,
      channels: input.plan.output.channels,
      contentHash: hashBytes(bytes),
      byteCount: bytes.byteLength,
      mediaSignature: "mpeg-audio",
    });
    const partial: Omit<
      AudiobookRetailSampleRenderEvidence,
      "fingerprint"
    > = {
      schemaVersion: AUDIOBOOK_RETAIL_SAMPLE_RENDER_SCHEMA_VERSION,
      id: `retail_sample_render_${stableHash({
        plan: input.plan.fingerprint,
        output: output.contentHash,
      }).slice(0, 24)}`,
      projectId: input.plan.projectId,
      bookId: input.plan.bookId,
      planId: input.plan.id,
      planFingerprint: input.plan.fingerprint,
      source: Object.freeze({
        trackOrdinal: input.plan.source.trackOrdinal,
        role: input.plan.source.role,
        fileName: input.plan.source.fileName,
        artifactId: input.plan.source.approvedArtifactId,
        artifactRevision: input.plan.source.approvedArtifactRevision,
        artifactFingerprint: input.plan.source.approvedArtifactFingerprint,
        contentHash: input.plan.source.approvedArtifactContentHash,
        byteCount: input.plan.source.approvedArtifactByteCount,
      }),
      range: input.plan.range,
      output,
      filterFingerprint: stableHash(filterScript),
      commandFingerprint: commandFingerprint(input.plan, filterScript),
      tool: Object.freeze({
        executableName: safeExecutableName(input.ffmpegPath ?? "ffmpeg"),
        versionLine: checkedVersion,
        versionFingerprint: stableHash(checkedVersion),
      }),
      renderedAt: renderedAt.toISOString(),
    };
    const evidence = Object.freeze({
      ...partial,
      fingerprint: evidenceFingerprint(partial),
    });
    const result = Object.freeze({ evidence, bytes });
    assertAudiobookRetailSampleRenderEvidence(evidence);
    assertAudiobookRetailSampleRenderMatchesPlan(evidence, input.plan);
    assertAudiobookRetailSampleRenderResult(result);
    return result;
  } finally {
    if (source) await source.dispose();
  }
}

export function audiobookRetailSampleRenderPublicView(
  evidence: AudiobookRetailSampleRenderEvidence,
): AudiobookRetailSampleRenderPublicView {
  assertAudiobookRetailSampleRenderEvidence(evidence);
  return Object.freeze({
    id: evidence.id,
    bookId: evidence.bookId,
    planId: evidence.planId,
    sourceTrackOrdinal: evidence.source.trackOrdinal,
    sourceRole: evidence.source.role,
    sourceFileName: evidence.source.fileName,
    relativeStartMs: evidence.range.relativeStartMs,
    relativeEndMs: evidence.range.relativeEndMs,
    durationMs: evidence.range.durationMs,
    absoluteBookStartMs: evidence.range.absoluteBookStartMs,
    absoluteBookEndMs: evidence.range.absoluteBookEndMs,
    output: evidence.output,
    toolVersionFingerprint: evidence.tool.versionFingerprint,
    renderedAt: evidence.renderedAt,
    fingerprint: evidence.fingerprint,
  });
}
