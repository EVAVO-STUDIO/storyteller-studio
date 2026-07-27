import { createHash } from "node:crypto";
import { basename } from "node:path";
import {
  ChapterRenderError,
  NodeChapterRenderRunner,
  type ChapterRenderRunner,
} from "./chapter-render.js";
import {
  assertAudioEngineeringEvidence,
  type AudioEngineeringEvidence,
} from "./audio-engineering.js";
import {
  assertMasteringPlan,
  type MasteringArtifactSnapshot,
  type MasteringOperation,
  type MasteringPlan,
} from "./mastering-plan.js";
import { stableHash } from "./index.js";
import { detectArtifactMedia } from "./private-object-store.js";

export const MASTERING_RENDER_SCHEMA_VERSION = "storyteller-mastering-render-v1" as const;

export interface ResolvedMasteringSource {
  artifactId: string;
  privatePath: string;
  contentHash: string;
  byteCount: number;
  dispose(): Promise<void>;
}

export interface MasteringSourceResolver {
  resolve(
    snapshot: MasteringArtifactSnapshot,
    signal?: AbortSignal,
  ): Promise<ResolvedMasteringSource>;
}

export interface MasteringRenderEvidence {
  schemaVersion: typeof MASTERING_RENDER_SCHEMA_VERSION;
  id: string;
  planId: string;
  planFingerprint: string;
  source: Readonly<{
    artifactId: string;
    artifactFingerprint: string;
    contentHash: string;
    byteCount: number;
    engineeringFingerprint: string;
    durationMs: number;
  }>;
  output: Readonly<{
    format: "wav";
    sampleRateHz: number;
    channels: 1 | 2;
    bitDepth: 16 | 24 | 32;
    contentHash: string;
    byteCount: number;
    mediaSignature: string;
  }>;
  operationKinds: readonly MasteringOperation["kind"][];
  operationsFingerprint: string;
  predictedMetricsFingerprint: string;
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

export interface MasteringRenderResult {
  evidence: MasteringRenderEvidence;
  bytes: Uint8Array;
}

export interface MasteringRenderPublicView {
  id: string;
  planId: string;
  planFingerprint: string;
  sourceDurationMs: number;
  operationKinds: readonly MasteringOperation["kind"][];
  output: MasteringRenderEvidence["output"];
  operationsFingerprint: string;
  predictedMetricsFingerprint: string;
  filterFingerprint: string;
  toolVersionFingerprint: string;
  renderedAt: string;
  fingerprint: string;
}

export interface RenderMasteringPlanInput {
  plan: MasteringPlan;
  sourceEngineeringEvidence: AudioEngineeringEvidence;
  sources: MasteringSourceResolver;
  runner?: ChapterRenderRunner;
  ffmpegPath?: string;
  temporaryRoot?: string;
  timeoutMs?: number;
  maximumOutputBytes?: number;
  renderedAt?: Date;
  signal?: AbortSignal;
}

export class MasteringRenderError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "MasteringRenderError";
    this.code = code;
  }
}

const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const DEFAULT_TIMEOUT_MS = 15 * 60_000;
const DEFAULT_MAXIMUM_OUTPUT_BYTES = 2 * 1024 * 1024 * 1024;
const ABSOLUTE_MAXIMUM_OUTPUT_BYTES = 4 * 1024 * 1024 * 1024;
const EPSILON = 0.0001;

function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function requireInteger(value: number, minimum: number, maximum: number, code: string): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new MasteringRenderError(code);
  }
  return value;
}

function safeExecutableName(value: string): string {
  const name = basename(value.trim());
  if (!name || name.length > 200 || CONTROL_CHARACTERS.test(name)) {
    throw new MasteringRenderError("MASTERING_RENDER_EXECUTABLE_INVALID");
  }
  return name;
}

function versionLine(output: string): string {
  const line = output.split(/\r?\n/u).map((value) => value.trim()).find(Boolean);
  if (!line || line.length > 500 || CONTROL_CHARACTERS.test(line)) {
    throw new MasteringRenderError("MASTERING_RENDER_TOOL_VERSION_INVALID");
  }
  return line;
}

function decimal(value: number, places = 6): string {
  return value.toFixed(places).replace(/\.?0+$/u, "");
}

function channelLayout(channels: 1 | 2): string {
  return channels === 1 ? "mono" : "stereo";
}

function highPassFilters(operation: Extract<MasteringOperation, { kind: "high-pass" }>): readonly string[] {
  const filter = (poles: 1 | 2) =>
    `highpass=f=${decimal(operation.frequencyHz)}:p=${poles}`;
  switch (operation.slopeDbPerOctave) {
    case 6:
      return [filter(1)];
    case 12:
      return [filter(2)];
    case 18:
      return [filter(1), filter(2)];
    case 24:
      return [filter(2), filter(2)];
  }
}

function limiterReduction(
  plan: MasteringPlan,
  operation: Extract<MasteringOperation, { kind: "true-peak-limiter" }>,
): number {
  if (plan.operations.some((candidate) => candidate.kind === "high-pass")) {
    throw new MasteringRenderError(
      "MASTERING_RENDER_LIMITER_REDUCTION_REQUIRES_INTERMEDIATE_MEASUREMENT",
    );
  }
  const gainDb = plan.operations
    .filter((candidate): candidate is Extract<MasteringOperation, { kind: "gain" }> =>
      candidate.kind === "gain"
    )
    .reduce((total, candidate) => total + candidate.gainDb, 0);
  const sourcePeak = plan.sourceEngineering.metrics.truePeakDb
    ?? plan.sourceEngineering.metrics.peakDb;
  return Math.max(0, sourcePeak + gainDb - operation.ceilingDb);
}

export function buildMasteringFilterScript(plan: MasteringPlan): string {
  assertMasteringPlan(plan);
  const filters: string[] = [];
  for (const operation of plan.operations) {
    switch (operation.kind) {
      case "high-pass":
        filters.push(...highPassFilters(operation));
        break;
      case "gain":
        filters.push(`volume=${decimal(operation.gainDb, 4)}dB:precision=double`);
        break;
      case "true-peak-limiter": {
        const reductionDb = limiterReduction(plan, operation);
        if (reductionDb > operation.maximumReductionDb + EPSILON) {
          throw new MasteringRenderError("MASTERING_RENDER_LIMITER_REDUCTION_EXCEEDS_PLAN");
        }
        const linearLimit = 10 ** (operation.ceilingDb / 20);
        filters.push(
          "aresample=192000:resampler=soxr:precision=28",
          `alimiter=limit=${decimal(linearLimit, 8)}:attack=5:release=50:level=0:latency=1`,
          `aresample=${plan.output.sampleRateHz}:resampler=soxr:precision=28`,
        );
        break;
      }
    }
  }
  filters.push(
    `aformat=sample_rates=${plan.output.sampleRateHz}:channel_layouts=${channelLayout(plan.output.channels)}`,
  );
  return `[0:a]${filters.join(",")}[out]\n`;
}

function assertSourceEngineering(plan: MasteringPlan, evidence: AudioEngineeringEvidence): number {
  assertAudioEngineeringEvidence(evidence);
  if (
    evidence.fingerprint !== plan.sourceEngineering.evidenceFingerprint
    || evidence.inputContentHash !== plan.sourceMaster.contentHash
    || evidence.inputByteCount !== plan.sourceMaster.byteCount
    || stableHash(evidence.metrics) !== stableHash(plan.sourceEngineering.metrics)
  ) {
    throw new MasteringRenderError("MASTERING_RENDER_SOURCE_ENGINEERING_MISMATCH");
  }
  return requireInteger(
    Math.round(evidence.probe.durationSeconds * 1_000),
    1,
    7 * 24 * 60 * 60 * 1_000,
    "MASTERING_RENDER_SOURCE_DURATION_INVALID",
  );
}

function evidenceFingerprint(evidence: Omit<MasteringRenderEvidence, "fingerprint">): string {
  return stableHash(evidence);
}

export function assertMasteringRenderEvidence(evidence: MasteringRenderEvidence): void {
  if (evidence.schemaVersion !== MASTERING_RENDER_SCHEMA_VERSION) {
    throw new MasteringRenderError("MASTERING_RENDER_SCHEMA_UNSUPPORTED");
  }
  if (!SAFE_IDENTIFIER.test(evidence.id)) throw new MasteringRenderError("MASTERING_RENDER_ID_INVALID");
  if (!SAFE_IDENTIFIER.test(evidence.planId)) throw new MasteringRenderError("MASTERING_RENDER_PLAN_ID_INVALID");
  for (const hash of [
    evidence.planFingerprint,
    evidence.source.artifactFingerprint,
    evidence.source.contentHash,
    evidence.source.engineeringFingerprint,
    evidence.output.contentHash,
    evidence.operationsFingerprint,
    evidence.predictedMetricsFingerprint,
    evidence.filterFingerprint,
    evidence.commandFingerprint,
    evidence.tool.versionFingerprint,
  ]) {
    if (!HASH_PATTERN.test(hash)) throw new MasteringRenderError("MASTERING_RENDER_HASH_INVALID");
  }
  if (!SAFE_IDENTIFIER.test(evidence.source.artifactId)) {
    throw new MasteringRenderError("MASTERING_RENDER_SOURCE_ID_INVALID");
  }
  requireInteger(evidence.source.byteCount, 1, Number.MAX_SAFE_INTEGER, "MASTERING_RENDER_SOURCE_SIZE_INVALID");
  requireInteger(evidence.source.durationMs, 1, 7 * 24 * 60 * 60 * 1_000, "MASTERING_RENDER_SOURCE_DURATION_INVALID");
  if (evidence.output.format !== "wav") throw new MasteringRenderError("MASTERING_RENDER_OUTPUT_FORMAT_INVALID");
  requireInteger(evidence.output.sampleRateHz, 8_000, 384_000, "MASTERING_RENDER_OUTPUT_RATE_INVALID");
  if (evidence.output.channels !== 1 && evidence.output.channels !== 2) {
    throw new MasteringRenderError("MASTERING_RENDER_OUTPUT_CHANNELS_INVALID");
  }
  if (![16, 24, 32].includes(evidence.output.bitDepth)) {
    throw new MasteringRenderError("MASTERING_RENDER_OUTPUT_DEPTH_INVALID");
  }
  requireInteger(evidence.output.byteCount, 1, ABSOLUTE_MAXIMUM_OUTPUT_BYTES, "MASTERING_RENDER_OUTPUT_SIZE_INVALID");
  if (evidence.output.mediaSignature !== "riff-wave") {
    throw new MasteringRenderError("MASTERING_RENDER_OUTPUT_SIGNATURE_INVALID");
  }
  if (!Array.isArray(evidence.operationKinds) || evidence.operationKinds.length > 3) {
    throw new MasteringRenderError("MASTERING_RENDER_OPERATIONS_INVALID");
  }
  safeExecutableName(evidence.tool.executableName);
  versionLine(evidence.tool.versionLine);
  if (stableHash(evidence.tool.versionLine) !== evidence.tool.versionFingerprint) {
    throw new MasteringRenderError("MASTERING_RENDER_TOOL_VERSION_MISMATCH");
  }
  if (Number.isNaN(Date.parse(evidence.renderedAt))) {
    throw new MasteringRenderError("MASTERING_RENDER_DATE_INVALID");
  }
  const { fingerprint, ...partial } = evidence;
  if (evidenceFingerprint(partial) !== fingerprint) {
    throw new MasteringRenderError("MASTERING_RENDER_FINGERPRINT_MISMATCH");
  }
}

function commandFingerprint(plan: MasteringPlan, filterScript: string): string {
  return stableHash({
    planFingerprint: plan.fingerprint,
    sourceContentHash: plan.sourceMaster.contentHash,
    filterFingerprint: stableHash(filterScript),
    output: plan.output,
    shell: false,
  });
}

export async function renderMasteringPlan(
  input: RenderMasteringPlanInput,
): Promise<MasteringRenderResult> {
  assertMasteringPlan(input.plan);
  const durationMs = assertSourceEngineering(input.plan, input.sourceEngineeringEvidence);
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maximumOutputBytes = input.maximumOutputBytes ?? DEFAULT_MAXIMUM_OUTPUT_BYTES;
  requireInteger(timeoutMs, 100, 60 * 60_000, "MASTERING_RENDER_TIMEOUT_INVALID");
  requireInteger(maximumOutputBytes, 1, ABSOLUTE_MAXIMUM_OUTPUT_BYTES, "MASTERING_RENDER_OUTPUT_LIMIT_INVALID");
  const renderedAt = input.renderedAt ?? new Date();
  if (Number.isNaN(renderedAt.getTime())) throw new MasteringRenderError("MASTERING_RENDER_DATE_INVALID");
  if (input.signal?.aborted) {
    throw input.signal.reason instanceof Error
      ? input.signal.reason
      : new MasteringRenderError("MASTERING_RENDER_ABORTED");
  }

  let source: ResolvedMasteringSource | undefined;
  try {
    source = await input.sources.resolve(input.plan.sourceMaster, input.signal);
    if (
      source.artifactId !== input.plan.sourceMaster.id
      || source.contentHash !== input.plan.sourceMaster.contentHash
      || source.byteCount !== input.plan.sourceMaster.byteCount
    ) {
      throw new MasteringRenderError("MASTERING_RENDER_SOURCE_INTEGRITY_MISMATCH");
    }
    if (!source.privatePath.trim() || source.privatePath.includes("\0")) {
      throw new MasteringRenderError("MASTERING_RENDER_PRIVATE_PATH_INVALID");
    }
    const filterScript = buildMasteringFilterScript(input.plan);
    const runner = input.runner ?? new NodeChapterRenderRunner({
      ...(input.ffmpegPath ? { ffmpegPath: input.ffmpegPath } : {}),
      ...(input.temporaryRoot ? { temporaryRoot: input.temporaryRoot } : {}),
    });
    const toolVersionLine = versionLine(await runner.inspectVersion(input.signal));
    const bytes = await runner.render({
      sourcePaths: [source.privatePath],
      filterScript,
      sampleRateHz: input.plan.output.sampleRateHz,
      channels: input.plan.output.channels,
      bitDepth: input.plan.output.bitDepth,
      expectedDurationMs: durationMs,
      timeoutMs,
      maximumOutputBytes,
    }, input.signal);
    if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0 || bytes.byteLength > maximumOutputBytes) {
      throw new MasteringRenderError("MASTERING_RENDER_OUTPUT_SIZE_INVALID");
    }
    const media = detectArtifactMedia(bytes);
    if (media.format !== "wav" || media.mimeType !== "audio/wav" || media.signature !== "riff-wave") {
      throw new MasteringRenderError("MASTERING_RENDER_OUTPUT_MEDIA_INVALID");
    }
    const partial: Omit<MasteringRenderEvidence, "fingerprint"> = {
      schemaVersion: MASTERING_RENDER_SCHEMA_VERSION,
      id: `mastering_render_${stableHash({ plan: input.plan.fingerprint, output: hashBytes(bytes) }).slice(0, 24)}`,
      planId: input.plan.id,
      planFingerprint: input.plan.fingerprint,
      source: Object.freeze({
        artifactId: input.plan.sourceMaster.id,
        artifactFingerprint: input.plan.sourceMaster.fingerprint,
        contentHash: input.plan.sourceMaster.contentHash,
        byteCount: input.plan.sourceMaster.byteCount,
        engineeringFingerprint: input.sourceEngineeringEvidence.fingerprint,
        durationMs,
      }),
      output: Object.freeze({
        ...input.plan.output,
        contentHash: hashBytes(bytes),
        byteCount: bytes.byteLength,
        mediaSignature: media.signature,
      }),
      operationKinds: Object.freeze(input.plan.operations.map((operation) => operation.kind)),
      operationsFingerprint: stableHash(input.plan.operations),
      predictedMetricsFingerprint: stableHash(input.plan.prediction.metrics),
      filterFingerprint: stableHash(filterScript),
      commandFingerprint: commandFingerprint(input.plan, filterScript),
      tool: Object.freeze({
        executableName: safeExecutableName(input.ffmpegPath ?? "ffmpeg"),
        versionLine: toolVersionLine,
        versionFingerprint: stableHash(toolVersionLine),
      }),
      renderedAt: renderedAt.toISOString(),
    };
    const evidence = Object.freeze({ ...partial, fingerprint: evidenceFingerprint(partial) });
    assertMasteringRenderEvidence(evidence);
    return Object.freeze({ evidence, bytes });
  } catch (error) {
    if (error instanceof MasteringRenderError) throw error;
    if (error instanceof ChapterRenderError) {
      throw new MasteringRenderError(`MASTERING_RENDER_${error.code.replace(/^CHAPTER_RENDER_/u, "")}`);
    }
    throw new MasteringRenderError("MASTERING_RENDER_FAILED");
  } finally {
    if (source) await Promise.allSettled([source.dispose()]);
  }
}

export function masteringRenderPublicView(
  evidence: MasteringRenderEvidence,
): MasteringRenderPublicView {
  assertMasteringRenderEvidence(evidence);
  return Object.freeze({
    id: evidence.id,
    planId: evidence.planId,
    planFingerprint: evidence.planFingerprint,
    sourceDurationMs: evidence.source.durationMs,
    operationKinds: evidence.operationKinds,
    output: evidence.output,
    operationsFingerprint: evidence.operationsFingerprint,
    predictedMetricsFingerprint: evidence.predictedMetricsFingerprint,
    filterFingerprint: evidence.filterFingerprint,
    toolVersionFingerprint: evidence.tool.versionFingerprint,
    renderedAt: evidence.renderedAt,
    fingerprint: evidence.fingerprint,
  });
}
