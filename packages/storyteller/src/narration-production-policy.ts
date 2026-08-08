import {
  stableHash,
  type GenerationJob,
  type ManuscriptSegment,
  type PerformanceDirection,
  type SegmentedManuscript,
} from "./index.js";
import { AUDIO_STUDIO_PROVIDER_ID } from "./audio-studio-types.js";
import type { ProviderExecutionMode } from "./provider-adapter.js";

export const NARRATION_PRODUCTION_PLAN_SCHEMA_VERSION =
  "storyteller-natural-narration-plan-v1" as const;
export const NARRATION_CONTEXT_SCHEMA_VERSION =
  "storyteller-narration-context-v1" as const;
export const NATURAL_NARRATION_MINIMUM_CANDIDATES = 3;
export const NATURAL_NARRATION_MAXIMUM_SEGMENT_CHARACTERS = 1_200;
export const NATURAL_NARRATION_MAXIMUM_ESTIMATED_SECONDS = 75;

export type NarrationContextBoundary =
  | "opening"
  | "middle"
  | "closing"
  | "standalone";

export interface NarrationContextWindow {
  schemaVersion: typeof NARRATION_CONTEXT_SCHEMA_VERSION;
  segmentId: string;
  sourceHash: string;
  previousContext: string;
  nextContext: string;
  boundary: NarrationContextBoundary;
  availableCharacters: number;
  fingerprint: string;
}

export interface NaturalNarrationProductionPlan {
  schemaVersion: typeof NARRATION_PRODUCTION_PLAN_SCHEMA_VERSION;
  segmentId: string;
  sourceHash: string;
  textHash: string;
  directionFingerprint: string;
  language: string;
  context: NarrationContextWindow;
  minimumCandidateCount: number;
  maximumSegmentCharacters: number;
  maximumEstimatedSeconds: number;
  requireBlindComparativeReview: true;
  fingerprint: string;
}

export interface NaturalNarrationMaterialView {
  text: string;
  immutableSourceHash: string;
  direction: PerformanceDirection;
  mode?: ProviderExecutionMode;
  naturalNarration?: NaturalNarrationProductionPlan;
}

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const LANGUAGE_PATTERN = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,3}$/u;
const GENERIC_OBJECTIVES = new Set([
  "clear neutral narration",
  "neutral narration",
  "read naturally",
  "natural",
  "none",
  "carry the listener through the author’s thought while preserving narrative perspective.",
  "speak from the character’s immediate need, not from an emotion label.",
  "allow the previous dramatic beat to settle before the world changes.",
]);
const EMPTY_SUBTEXT = new Set([
  "none",
  "n/a",
  "not applicable",
  "do not explain more than the prose reveals.",
  "infer what the speaker is trying to obtain, avoid or hide; retain ambiguity when the text retains it.",
]);
const PREVIOUS_SENTINEL = "start-of-chapter";
const NEXT_SENTINEL = "end-of-chapter";

function requireIdentifier(value: string, code: string): string {
  if (!SAFE_IDENTIFIER.test(value)) throw new Error(code);
  return value;
}

function requireHash(value: string, code: string): string {
  if (!HASH_PATTERN.test(value)) throw new Error(code);
  return value;
}

function requireText(
  value: string,
  maximum: number,
  code: string,
): string {
  if (
    typeof value !== "string"
    || value.trim().length === 0
    || value.length > maximum
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)
  ) {
    throw new Error(code);
  }
  return value;
}

function contextBase(
  context: Omit<NarrationContextWindow, "fingerprint">,
): Readonly<Record<string, unknown>> {
  return {
    schemaVersion: context.schemaVersion,
    segmentId: context.segmentId,
    sourceHash: context.sourceHash,
    previousContext: context.previousContext,
    nextContext: context.nextContext,
    boundary: context.boundary,
    availableCharacters: context.availableCharacters,
  };
}

function planBase(
  plan: Omit<NaturalNarrationProductionPlan, "fingerprint">,
): Readonly<Record<string, unknown>> {
  return {
    schemaVersion: plan.schemaVersion,
    segmentId: plan.segmentId,
    sourceHash: plan.sourceHash,
    textHash: plan.textHash,
    directionFingerprint: plan.directionFingerprint,
    language: plan.language,
    context: plan.context,
    minimumCandidateCount: plan.minimumCandidateCount,
    maximumSegmentCharacters: plan.maximumSegmentCharacters,
    maximumEstimatedSeconds: plan.maximumEstimatedSeconds,
    requireBlindComparativeReview: plan.requireBlindComparativeReview,
  };
}

function isContextSegment(segment: ManuscriptSegment): boolean {
  return segment.kind !== "heading" && segment.kind !== "scene-break";
}

function collectPreviousContext(
  segments: readonly ManuscriptSegment[],
  targetIndex: number,
  maximumCharacters: number,
): string {
  const target = segments[targetIndex];
  if (!target) throw new Error("NARRATION_CONTEXT_TARGET_MISSING");
  const selected: string[] = [];
  for (let index = targetIndex - 1; index >= 0; index -= 1) {
    const candidate = segments[index];
    if (!candidate || candidate.chapterId !== target.chapterId || !isContextSegment(candidate)) break;
    selected.unshift(candidate.text);
    const joined = selected.join("\n\n");
    if (joined.length >= maximumCharacters) {
      return joined.slice(Math.max(0, joined.length - maximumCharacters));
    }
  }
  return selected.length > 0 ? selected.join("\n\n") : PREVIOUS_SENTINEL;
}

function collectNextContext(
  segments: readonly ManuscriptSegment[],
  targetIndex: number,
  maximumCharacters: number,
): string {
  const target = segments[targetIndex];
  if (!target) throw new Error("NARRATION_CONTEXT_TARGET_MISSING");
  const selected: string[] = [];
  for (let index = targetIndex + 1; index < segments.length; index += 1) {
    const candidate = segments[index];
    if (!candidate || candidate.chapterId !== target.chapterId || !isContextSegment(candidate)) break;
    selected.push(candidate.text);
    const joined = selected.join("\n\n");
    if (joined.length >= maximumCharacters) return joined.slice(0, maximumCharacters);
  }
  return selected.length > 0 ? selected.join("\n\n") : NEXT_SENTINEL;
}

function contextBoundary(previousContext: string, nextContext: string): NarrationContextBoundary {
  const hasPrevious = previousContext !== PREVIOUS_SENTINEL;
  const hasNext = nextContext !== NEXT_SENTINEL;
  if (hasPrevious && hasNext) return "middle";
  if (!hasPrevious && hasNext) return "opening";
  if (hasPrevious && !hasNext) return "closing";
  return "standalone";
}

export function createNarrationContextWindow(
  manuscript: SegmentedManuscript,
  segmentId: string,
  options: Readonly<{ maximumCharacters?: number }> = {},
): NarrationContextWindow {
  requireIdentifier(segmentId, "NARRATION_CONTEXT_SEGMENT_ID_INVALID");
  requireHash(manuscript.sourceHash, "NARRATION_CONTEXT_SOURCE_HASH_INVALID");
  const maximumCharacters = options.maximumCharacters ?? 1_200;
  if (
    !Number.isSafeInteger(maximumCharacters)
    || maximumCharacters < 120
    || maximumCharacters > 4_000
  ) {
    throw new Error("NARRATION_CONTEXT_CHARACTER_LIMIT_INVALID");
  }
  const targetIndex = manuscript.segments.findIndex((segment) => segment.id === segmentId);
  if (targetIndex < 0) throw new Error("NARRATION_CONTEXT_SEGMENT_MISSING");
  const previousContext = collectPreviousContext(
    manuscript.segments,
    targetIndex,
    maximumCharacters,
  );
  const nextContext = collectNextContext(
    manuscript.segments,
    targetIndex,
    maximumCharacters,
  );
  const availableCharacters =
    (previousContext === PREVIOUS_SENTINEL ? 0 : previousContext.length)
    + (nextContext === NEXT_SENTINEL ? 0 : nextContext.length);
  const partial: Omit<NarrationContextWindow, "fingerprint"> = {
    schemaVersion: NARRATION_CONTEXT_SCHEMA_VERSION,
    segmentId,
    sourceHash: manuscript.sourceHash,
    previousContext,
    nextContext,
    boundary: contextBoundary(previousContext, nextContext),
    availableCharacters,
  };
  return Object.freeze({
    ...partial,
    fingerprint: stableHash(contextBase(partial)),
  });
}

export function assertNarrationContextWindow(
  context: NarrationContextWindow,
): void {
  if (context.schemaVersion !== NARRATION_CONTEXT_SCHEMA_VERSION) {
    throw new Error("NARRATION_CONTEXT_SCHEMA_UNSUPPORTED");
  }
  requireIdentifier(context.segmentId, "NARRATION_CONTEXT_SEGMENT_ID_INVALID");
  requireHash(context.sourceHash, "NARRATION_CONTEXT_SOURCE_HASH_INVALID");
  requireText(context.previousContext, 4_000, "NARRATION_PREVIOUS_CONTEXT_INVALID");
  requireText(context.nextContext, 4_000, "NARRATION_NEXT_CONTEXT_INVALID");
  if (!(["opening", "middle", "closing", "standalone"] as const).includes(context.boundary)) {
    throw new Error("NARRATION_CONTEXT_BOUNDARY_INVALID");
  }
  if (context.boundary !== contextBoundary(context.previousContext, context.nextContext)) {
    throw new Error("NARRATION_CONTEXT_BOUNDARY_MISMATCH");
  }
  const expectedAvailableCharacters =
    (context.previousContext === PREVIOUS_SENTINEL ? 0 : context.previousContext.length)
    + (context.nextContext === NEXT_SENTINEL ? 0 : context.nextContext.length);
  if (
    !Number.isSafeInteger(context.availableCharacters)
    || context.availableCharacters < 0
    || context.availableCharacters !== expectedAvailableCharacters
  ) {
    throw new Error("NARRATION_CONTEXT_AVAILABLE_CHARACTERS_INVALID");
  }
  const { fingerprint, ...partial } = context;
  if (!HASH_PATTERN.test(fingerprint) || fingerprint !== stableHash(contextBase(partial))) {
    throw new Error("NARRATION_CONTEXT_FINGERPRINT_INVALID");
  }
}

function requireSpecificDirection(direction: PerformanceDirection): void {
  const objective = requireText(
    direction.emotionalObjective,
    2_000,
    "NARRATION_PRODUCTION_OBJECTIVE_INVALID",
  ).trim().toLocaleLowerCase("en-AU");
  const subtext = requireText(
    direction.subtext,
    2_000,
    "NARRATION_PRODUCTION_SUBTEXT_INVALID",
  ).trim().toLocaleLowerCase("en-AU");
  if (GENERIC_OBJECTIVES.has(objective)) {
    throw new Error("NARRATION_PRODUCTION_OBJECTIVE_GENERIC");
  }
  if (EMPTY_SUBTEXT.has(subtext)) {
    throw new Error("NARRATION_PRODUCTION_SUBTEXT_GENERIC");
  }
}

export function createNaturalNarrationProductionPlan(
  input: Readonly<{
    manuscript: SegmentedManuscript;
    segmentId: string;
    direction: PerformanceDirection;
    language?: string;
    maximumContextCharacters?: number;
  }>,
): NaturalNarrationProductionPlan {
  const segment = input.manuscript.segments.find(
    (candidate) => candidate.id === input.segmentId,
  );
  if (!segment) throw new Error("NARRATION_PRODUCTION_SEGMENT_MISSING");
  if (input.direction.segmentId !== segment.id) {
    throw new Error("NARRATION_PRODUCTION_DIRECTION_SCOPE_MISMATCH");
  }
  requireSpecificDirection(input.direction);
  if (segment.text.length > NATURAL_NARRATION_MAXIMUM_SEGMENT_CHARACTERS) {
    throw new Error("NARRATION_PRODUCTION_SEGMENT_TOO_LONG");
  }
  if (segment.estimatedSpeechSeconds > NATURAL_NARRATION_MAXIMUM_ESTIMATED_SECONDS) {
    throw new Error("NARRATION_PRODUCTION_DURATION_TOO_LONG");
  }
  const language = input.language ?? "en-AU";
  if (!LANGUAGE_PATTERN.test(language)) {
    throw new Error("NARRATION_PRODUCTION_LANGUAGE_INVALID");
  }
  const context = createNarrationContextWindow(
    input.manuscript,
    segment.id,
    {
      ...(input.maximumContextCharacters !== undefined
        ? { maximumCharacters: input.maximumContextCharacters }
        : {}),
    },
  );
  if (segment.text.length > 600 && context.availableCharacters < 120) {
    throw new Error("NARRATION_PRODUCTION_CONTEXT_INSUFFICIENT");
  }
  const partial: Omit<NaturalNarrationProductionPlan, "fingerprint"> = {
    schemaVersion: NARRATION_PRODUCTION_PLAN_SCHEMA_VERSION,
    segmentId: segment.id,
    sourceHash: input.manuscript.sourceHash,
    textHash: stableHash(segment.text),
    directionFingerprint: stableHash(input.direction),
    language,
    context,
    minimumCandidateCount: NATURAL_NARRATION_MINIMUM_CANDIDATES,
    maximumSegmentCharacters: NATURAL_NARRATION_MAXIMUM_SEGMENT_CHARACTERS,
    maximumEstimatedSeconds: NATURAL_NARRATION_MAXIMUM_ESTIMATED_SECONDS,
    requireBlindComparativeReview: true,
  };
  return Object.freeze({
    ...partial,
    fingerprint: stableHash(planBase(partial)),
  });
}

export function assertNaturalNarrationProductionPlan(
  plan: NaturalNarrationProductionPlan,
  input: Readonly<{
    job: GenerationJob;
    material: Omit<NaturalNarrationMaterialView, "naturalNarration">;
  }>,
): void {
  if (plan.schemaVersion !== NARRATION_PRODUCTION_PLAN_SCHEMA_VERSION) {
    throw new Error("NARRATION_PRODUCTION_PLAN_SCHEMA_UNSUPPORTED");
  }
  requireIdentifier(plan.segmentId, "NARRATION_PRODUCTION_SEGMENT_ID_INVALID");
  requireHash(plan.sourceHash, "NARRATION_PRODUCTION_SOURCE_HASH_INVALID");
  requireHash(plan.textHash, "NARRATION_PRODUCTION_TEXT_HASH_INVALID");
  requireHash(
    plan.directionFingerprint,
    "NARRATION_PRODUCTION_DIRECTION_FINGERPRINT_INVALID",
  );
  if (!LANGUAGE_PATTERN.test(plan.language)) {
    throw new Error("NARRATION_PRODUCTION_LANGUAGE_INVALID");
  }
  assertNarrationContextWindow(plan.context);
  if (
    plan.segmentId !== input.job.segmentId
    || plan.segmentId !== input.material.direction.segmentId
    || plan.context.segmentId !== input.job.segmentId
  ) {
    throw new Error("NARRATION_PRODUCTION_SCOPE_MISMATCH");
  }
  if (
    plan.sourceHash !== input.material.immutableSourceHash
    || plan.context.sourceHash !== input.material.immutableSourceHash
  ) {
    throw new Error("NARRATION_PRODUCTION_SOURCE_BINDING_MISMATCH");
  }
  if (plan.textHash !== stableHash(input.material.text)) {
    throw new Error("NARRATION_PRODUCTION_TEXT_BINDING_MISMATCH");
  }
  if (plan.directionFingerprint !== stableHash(input.material.direction)) {
    throw new Error("NARRATION_PRODUCTION_DIRECTION_BINDING_MISMATCH");
  }
  if (
    plan.minimumCandidateCount !== NATURAL_NARRATION_MINIMUM_CANDIDATES
    || input.job.candidateCount < plan.minimumCandidateCount
  ) {
    throw new Error("NARRATION_PRODUCTION_CANDIDATE_COUNT_INSUFFICIENT");
  }
  if (
    plan.maximumSegmentCharacters !== NATURAL_NARRATION_MAXIMUM_SEGMENT_CHARACTERS
    || input.material.text.length > plan.maximumSegmentCharacters
  ) {
    throw new Error("NARRATION_PRODUCTION_SEGMENT_TOO_LONG");
  }
  if (
    plan.maximumEstimatedSeconds !== NATURAL_NARRATION_MAXIMUM_ESTIMATED_SECONDS
    || plan.requireBlindComparativeReview !== true
  ) {
    throw new Error("NARRATION_PRODUCTION_POLICY_INVALID");
  }
  requireSpecificDirection(input.material.direction);
  if (input.material.text.length > 600 && plan.context.availableCharacters < 120) {
    throw new Error("NARRATION_PRODUCTION_CONTEXT_INSUFFICIENT");
  }
  const { fingerprint, ...partial } = plan;
  if (!HASH_PATTERN.test(fingerprint) || fingerprint !== stableHash(planBase(partial))) {
    throw new Error("NARRATION_PRODUCTION_PLAN_FINGERPRINT_INVALID");
  }
}

export function assertNaturalNarrationWorkerInput(
  job: GenerationJob,
  material: NaturalNarrationMaterialView,
): void {
  const mode = material.mode ?? "production";
  const usesAudioStudio = job.providerFallbackIds.includes(AUDIO_STUDIO_PROVIDER_ID);
  if (mode !== "production" || !usesAudioStudio) {
    if (material.naturalNarration) {
      assertNaturalNarrationProductionPlan(material.naturalNarration, {
        job,
        material,
      });
    }
    return;
  }
  if (!material.naturalNarration) {
    throw new Error("NARRATION_PRODUCTION_PLAN_REQUIRED");
  }
  assertNaturalNarrationProductionPlan(material.naturalNarration, {
    job,
    material,
  });
}

export function naturalNarrationRequestMetadata(
  plan: NaturalNarrationProductionPlan,
): Readonly<Record<string, string>> {
  return Object.freeze({
    language: plan.language,
    previousContext: plan.context.previousContext,
    nextContext: plan.context.nextContext,
    narrationContextBoundary: plan.context.boundary,
    narrationContextFingerprint: plan.context.fingerprint,
    naturalNarrationPlanFingerprint: plan.fingerprint,
  });
}
