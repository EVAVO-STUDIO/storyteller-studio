import {
  stableHash,
  type PerformanceDirection,
} from "./index.js";
import {
  assertExpressiveGenerationBinding,
  type ExpressiveGenerationBinding,
} from "./expressive-generation-binding.js";
import {
  assertExpressiveRoleContinuity,
  assertExpressiveRoleEnsemble,
  assertExpressiveVoiceRoleBinding,
  type ExpressiveVoiceRoleBinding,
} from "./narration-expressive-performance.js";

export const EXPRESSIVE_CAST_CONTINUITY_SCHEMA =
  "storyteller-expressive-cast-continuity-v1" as const;
export const EXPRESSIVE_CAST_ROLE_REGISTRATION_SCHEMA =
  "storyteller-expressive-cast-role-registration-v1" as const;
export const EXPRESSIVE_CAST_ROUTE_SCHEMA =
  "storyteller-expressive-cast-route-v1" as const;
export const EXPRESSIVE_CAST_CONTINUITY_PUBLIC_SCHEMA =
  "storyteller-expressive-cast-continuity-public-v1" as const;

export const EXPRESSIVE_CAST_MAXIMUM_TEMPLATE_REUSE = 2;

export type ExpressiveUtteranceKind =
  | "narration"
  | "dialogue"
  | "internal-monologue";

export interface ExpressiveCastRoleRegistration {
  schemaVersion: typeof EXPRESSIVE_CAST_ROLE_REGISTRATION_SCHEMA;
  assignmentId: string;
  binding: ExpressiveVoiceRoleBinding;
  introducedChapterId: string;
  introducedSceneId: string;
  fingerprint: string;
}

export interface ExpressiveCastRoute {
  schemaVersion: typeof EXPRESSIVE_CAST_ROUTE_SCHEMA;
  routeId: string;
  chapterId: string;
  chapterSequence: number;
  sceneId: string;
  sceneSequence: number;
  utteranceSequence: number;
  segmentId: string;
  segmentTextHash: string;
  utteranceKind: ExpressiveUtteranceKind;
  roleAssignmentId: string;
  direction: PerformanceDirection;
  generation: ExpressiveGenerationBinding;
  performanceBeat: string;
  continuityNote?: string;
  fingerprint: string;
}

export interface ExpressiveCastContinuityPlan {
  schemaVersion: typeof EXPRESSIVE_CAST_CONTINUITY_SCHEMA;
  projectId: string;
  bookId: string;
  sourceHash: string;
  revision: number;
  narratorAssignmentId: string;
  roles: readonly ExpressiveCastRoleRegistration[];
  routes: readonly ExpressiveCastRoute[];
  approvedBy: string;
  createdAt: string;
  updatedAt: string;
  previousFingerprint?: string;
  appendOnly: true;
  exactVoiceContinuityRequired: true;
  genericFallbackAllowed: false;
  automaticRecastAuthority: false;
  automaticPerformanceRewriteAuthority: false;
  titleReleaseAuthority: false;
  publicationAuthority: false;
  fingerprint: string;
}

export interface ExpressiveCastContinuityPublicView {
  schemaVersion: typeof EXPRESSIVE_CAST_CONTINUITY_PUBLIC_SCHEMA;
  projectId: string;
  bookId: string;
  revision: number;
  roleCount: number;
  characterRoleCount: number;
  chapterCount: number;
  sceneCount: number;
  routeCount: number;
  narratorRegistered: true;
  appendOnly: true;
  exactVoiceContinuityRequired: true;
  genericFallbackAllowed: false;
  automaticRecastAuthority: false;
  automaticPerformanceRewriteAuthority: false;
  titleReleaseAuthority: false;
  publicationAuthority: false;
  fingerprint: string;
}

export interface ExpressiveCastRouteMaterialView {
  text: string;
  immutableSourceHash: string;
  voiceProfileId: string;
  voiceRevision: number;
  voiceProfileHash?: string;
  direction: PerformanceDirection;
  expressivePerformance?: ExpressiveGenerationBinding;
}

export type ExpressiveCastRoleRegistrationInput = Omit<
  ExpressiveCastRoleRegistration,
  "schemaVersion" | "fingerprint"
>;

export type ExpressiveCastRouteInput = Omit<
  ExpressiveCastRoute,
  "schemaVersion" | "fingerprint"
>;

export type ExpressiveCastContinuityInput = Readonly<{
  projectId: string;
  bookId: string;
  sourceHash: string;
  narratorAssignmentId: string;
  roles: readonly ExpressiveCastRoleRegistrationInput[];
  routes: readonly ExpressiveCastRouteInput[];
  approvedBy: string;
}>;

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const HASH = /^[a-f0-9]{64}$/u;
const CONTROL = /[\u0000-\u001f\u007f]/u;
const GENERIC_PERFORMANCE_BEAT =
  /^(?:default|generic|natural|neutral|normal|read naturally|same as before)$/iu;

function requireIdentifier(value: string, code: string): string {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    throw new Error(code);
  }
  return value;
}

function requireHash(value: string, code: string): string {
  if (typeof value !== "string" || !HASH.test(value)) {
    throw new Error(code);
  }
  return value;
}

function requireDate(value: string, code: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new Error(code);
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
    throw new Error(code);
  }
  return value;
}

function requireText(
  value: string,
  minimum: number,
  maximum: number,
  code: string,
): string {
  if (
    typeof value !== "string"
    || value.trim().length < minimum
    || value.length > maximum
    || CONTROL.test(value)
  ) {
    throw new Error(code);
  }
  return value.trim();
}

function normalisedBeat(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en-AU")
    .replace(/\s+/gu, " ");
}

function roleRegistrationBase(
  value: Omit<ExpressiveCastRoleRegistration, "fingerprint">,
): Readonly<Record<string, unknown>> {
  return {
    schemaVersion: value.schemaVersion,
    assignmentId: value.assignmentId,
    binding: value.binding,
    introducedChapterId: value.introducedChapterId,
    introducedSceneId: value.introducedSceneId,
  };
}

function routeBase(
  value: Omit<ExpressiveCastRoute, "fingerprint">,
): Readonly<Record<string, unknown>> {
  return {
    schemaVersion: value.schemaVersion,
    routeId: value.routeId,
    chapterId: value.chapterId,
    chapterSequence: value.chapterSequence,
    sceneId: value.sceneId,
    sceneSequence: value.sceneSequence,
    utteranceSequence: value.utteranceSequence,
    segmentId: value.segmentId,
    segmentTextHash: value.segmentTextHash,
    utteranceKind: value.utteranceKind,
    roleAssignmentId: value.roleAssignmentId,
    direction: value.direction,
    generation: value.generation,
    performanceBeat: value.performanceBeat,
    continuityNote: value.continuityNote ?? null,
  };
}

function planBase(
  value: Omit<ExpressiveCastContinuityPlan, "fingerprint">,
): Readonly<Record<string, unknown>> {
  return {
    ...value,
    roles: [...value.roles],
    routes: [...value.routes],
  };
}

function routeOrderKey(route: ExpressiveCastRoute): readonly [number, number, number] {
  return [
    route.chapterSequence,
    route.sceneSequence,
    route.utteranceSequence,
  ];
}

function compareRoutes(
  left: ExpressiveCastRoute,
  right: ExpressiveCastRoute,
): number {
  const [leftChapter, leftScene, leftUtterance] = routeOrderKey(left);
  const [rightChapter, rightScene, rightUtterance] = routeOrderKey(right);
  return leftChapter - rightChapter
    || leftScene - rightScene
    || leftUtterance - rightUtterance
    || left.routeId.localeCompare(right.routeId, "en-AU");
}

function sameRouteOrder(
  left: ExpressiveCastRoute,
  right: ExpressiveCastRoute,
): boolean {
  const leftKey = routeOrderKey(left);
  const rightKey = routeOrderKey(right);
  return leftKey[0] === rightKey[0]
    && leftKey[1] === rightKey[1]
    && leftKey[2] === rightKey[2];
}

function sameVoice(
  left: Readonly<{ profileId: string; revision: number; profileHash: string }>,
  right: Readonly<{ profileId: string; revision: number; profileHash: string }>,
): boolean {
  return left.profileId === right.profileId
    && left.revision === right.revision
    && left.profileHash === right.profileHash;
}

function performanceTemplateFingerprint(
  route: ExpressiveCastRoute,
): string {
  const plan = route.generation.plan;
  return stableHash({
    roleAssignmentId: route.roleAssignmentId,
    voiceStrategy: plan.voiceStrategy,
    primaryEmotion: plan.primaryEmotion
      .normalize("NFKC")
      .toLocaleLowerCase("en-AU"),
    secondaryEmotion: plan.secondaryEmotion
      ?.normalize("NFKC")
      .toLocaleLowerCase("en-AU") ?? null,
    emotionalTrajectory: plan.emotionalTrajectory,
    emotionalIntensity: Number(plan.emotionalIntensity.toFixed(3)),
    cadence: {
      profile: plan.cadence.profile,
      minimumWpm: plan.cadence.minimumWpm,
      targetWpm: plan.cadence.targetWpm,
      maximumWpm: plan.cadence.maximumWpm,
      phraseLengthVariation: plan.cadence.phraseLengthVariation,
      pauseVariation: plan.cadence.pauseVariation,
      minimumPitchRangeSemitones:
        plan.cadence.minimumPitchRangeSemitones,
      minimumDynamicRangeDb: plan.cadence.minimumDynamicRangeDb,
    },
  });
}

function freezeDirection(
  direction: PerformanceDirection,
): PerformanceDirection {
  return Object.freeze({
    ...direction,
    notes: Object.freeze([...direction.notes]),
  });
}

function freezeGeneration(
  generation: ExpressiveGenerationBinding,
): ExpressiveGenerationBinding {
  return Object.freeze({
    ...generation,
    role: Object.freeze({
      ...generation.role,
      voice: Object.freeze({ ...generation.role.voice }),
    }),
    plan: Object.freeze({
      ...generation.plan,
      voice: Object.freeze({ ...generation.plan.voice }),
      cadence: Object.freeze({ ...generation.plan.cadence }),
      requiredProviderFeatures: Object.freeze([
        "style-instructions",
      ] as const),
      quality: Object.freeze({ ...generation.plan.quality }),
    }),
  });
}

export function createExpressiveCastRoleRegistration(
  input: ExpressiveCastRoleRegistrationInput,
): ExpressiveCastRoleRegistration {
  requireIdentifier(
    input.assignmentId,
    "EXPRESSIVE_CAST_ASSIGNMENT_ID_INVALID",
  );
  requireIdentifier(
    input.introducedChapterId,
    "EXPRESSIVE_CAST_INTRODUCED_CHAPTER_ID_INVALID",
  );
  requireIdentifier(
    input.introducedSceneId,
    "EXPRESSIVE_CAST_INTRODUCED_SCENE_ID_INVALID",
  );
  assertExpressiveVoiceRoleBinding(input.binding);
  const partial: Omit<ExpressiveCastRoleRegistration, "fingerprint"> = {
    schemaVersion: EXPRESSIVE_CAST_ROLE_REGISTRATION_SCHEMA,
    assignmentId: input.assignmentId,
    binding: Object.freeze({
      ...input.binding,
      voice: Object.freeze({ ...input.binding.voice }),
    }),
    introducedChapterId: input.introducedChapterId,
    introducedSceneId: input.introducedSceneId,
  };
  return Object.freeze({
    ...partial,
    fingerprint: stableHash(roleRegistrationBase(partial)),
  });
}

export function assertExpressiveCastRoleRegistration(
  value: ExpressiveCastRoleRegistration,
): void {
  if (
    value.schemaVersion !== EXPRESSIVE_CAST_ROLE_REGISTRATION_SCHEMA
  ) {
    throw new Error("EXPRESSIVE_CAST_ROLE_SCHEMA_UNSUPPORTED");
  }
  requireIdentifier(
    value.assignmentId,
    "EXPRESSIVE_CAST_ASSIGNMENT_ID_INVALID",
  );
  requireIdentifier(
    value.introducedChapterId,
    "EXPRESSIVE_CAST_INTRODUCED_CHAPTER_ID_INVALID",
  );
  requireIdentifier(
    value.introducedSceneId,
    "EXPRESSIVE_CAST_INTRODUCED_SCENE_ID_INVALID",
  );
  assertExpressiveVoiceRoleBinding(value.binding);
  const { fingerprint, ...partial } = value;
  if (
    !HASH.test(fingerprint)
    || fingerprint !== stableHash(roleRegistrationBase(partial))
  ) {
    throw new Error("EXPRESSIVE_CAST_ROLE_FINGERPRINT_INVALID");
  }
}

export function createExpressiveCastRoute(
  input: ExpressiveCastRouteInput,
): ExpressiveCastRoute {
  requireIdentifier(input.routeId, "EXPRESSIVE_CAST_ROUTE_ID_INVALID");
  requireIdentifier(input.chapterId, "EXPRESSIVE_CAST_CHAPTER_ID_INVALID");
  requireIdentifier(input.sceneId, "EXPRESSIVE_CAST_SCENE_ID_INVALID");
  requireIdentifier(input.segmentId, "EXPRESSIVE_CAST_SEGMENT_ID_INVALID");
  requireIdentifier(
    input.roleAssignmentId,
    "EXPRESSIVE_CAST_ROUTE_ASSIGNMENT_ID_INVALID",
  );
  requireInteger(
    input.chapterSequence,
    1,
    100_000,
    "EXPRESSIVE_CAST_CHAPTER_SEQUENCE_INVALID",
  );
  requireInteger(
    input.sceneSequence,
    1,
    100_000,
    "EXPRESSIVE_CAST_SCENE_SEQUENCE_INVALID",
  );
  requireInteger(
    input.utteranceSequence,
    1,
    1_000_000,
    "EXPRESSIVE_CAST_UTTERANCE_SEQUENCE_INVALID",
  );
  requireHash(
    input.segmentTextHash,
    "EXPRESSIVE_CAST_SEGMENT_TEXT_HASH_INVALID",
  );
  if (!([
    "narration",
    "dialogue",
    "internal-monologue",
  ] as const).includes(input.utteranceKind)) {
    throw new Error("EXPRESSIVE_CAST_UTTERANCE_KIND_INVALID");
  }
  const performanceBeat = requireText(
    input.performanceBeat,
    12,
    1_000,
    "EXPRESSIVE_CAST_PERFORMANCE_BEAT_INVALID",
  );
  if (GENERIC_PERFORMANCE_BEAT.test(normalisedBeat(performanceBeat))) {
    throw new Error("EXPRESSIVE_CAST_PERFORMANCE_BEAT_GENERIC");
  }
  const continuityNote = input.continuityNote === undefined
    ? undefined
    : requireText(
        input.continuityNote,
        12,
        1_000,
        "EXPRESSIVE_CAST_CONTINUITY_NOTE_INVALID",
      );
  assertExpressiveGenerationBinding(input.generation, input.direction);
  if (
    input.generation.plan.segmentId !== input.segmentId
    || input.direction.segmentId !== input.segmentId
  ) {
    throw new Error("EXPRESSIVE_CAST_ROUTE_SEGMENT_MISMATCH");
  }
  const partial: Omit<ExpressiveCastRoute, "fingerprint"> = {
    schemaVersion: EXPRESSIVE_CAST_ROUTE_SCHEMA,
    routeId: input.routeId,
    chapterId: input.chapterId,
    chapterSequence: input.chapterSequence,
    sceneId: input.sceneId,
    sceneSequence: input.sceneSequence,
    utteranceSequence: input.utteranceSequence,
    segmentId: input.segmentId,
    segmentTextHash: input.segmentTextHash,
    utteranceKind: input.utteranceKind,
    roleAssignmentId: input.roleAssignmentId,
    direction: freezeDirection(input.direction),
    generation: freezeGeneration(input.generation),
    performanceBeat,
    ...(continuityNote ? { continuityNote } : {}),
  };
  return Object.freeze({
    ...partial,
    fingerprint: stableHash(routeBase(partial)),
  });
}

export function assertExpressiveCastRoute(
  value: ExpressiveCastRoute,
): void {
  if (value.schemaVersion !== EXPRESSIVE_CAST_ROUTE_SCHEMA) {
    throw new Error("EXPRESSIVE_CAST_ROUTE_SCHEMA_UNSUPPORTED");
  }
  const { fingerprint, ...partial } = value;
  const recreated = createExpressiveCastRoute(partial);
  if (!HASH.test(fingerprint) || recreated.fingerprint !== fingerprint) {
    throw new Error("EXPRESSIVE_CAST_ROUTE_FINGERPRINT_INVALID");
  }
}

function validatePlanContent(
  plan: Omit<ExpressiveCastContinuityPlan, "fingerprint">,
): void {
  requireIdentifier(plan.projectId, "EXPRESSIVE_CAST_PROJECT_ID_INVALID");
  requireIdentifier(plan.bookId, "EXPRESSIVE_CAST_BOOK_ID_INVALID");
  requireHash(plan.sourceHash, "EXPRESSIVE_CAST_SOURCE_HASH_INVALID");
  requireIdentifier(
    plan.narratorAssignmentId,
    "EXPRESSIVE_CAST_NARRATOR_ASSIGNMENT_ID_INVALID",
  );
  requireIdentifier(plan.approvedBy, "EXPRESSIVE_CAST_APPROVER_INVALID");
  requireDate(plan.createdAt, "EXPRESSIVE_CAST_CREATED_AT_INVALID");
  requireDate(plan.updatedAt, "EXPRESSIVE_CAST_UPDATED_AT_INVALID");
  requireInteger(
    plan.revision,
    1,
    1_000_000,
    "EXPRESSIVE_CAST_REVISION_INVALID",
  );
  if (Date.parse(plan.updatedAt) < Date.parse(plan.createdAt)) {
    throw new Error("EXPRESSIVE_CAST_UPDATED_AT_BEFORE_CREATED_AT");
  }
  if (plan.revision === 1 && plan.previousFingerprint !== undefined) {
    throw new Error("EXPRESSIVE_CAST_INITIAL_PREVIOUS_FINGERPRINT_FORBIDDEN");
  }
  if (plan.revision > 1) {
    requireHash(
      plan.previousFingerprint ?? "",
      "EXPRESSIVE_CAST_PREVIOUS_FINGERPRINT_REQUIRED",
    );
  }
  if (
    plan.appendOnly !== true
    || plan.exactVoiceContinuityRequired !== true
    || plan.genericFallbackAllowed !== false
    || plan.automaticRecastAuthority !== false
    || plan.automaticPerformanceRewriteAuthority !== false
    || plan.titleReleaseAuthority !== false
    || plan.publicationAuthority !== false
  ) {
    throw new Error("EXPRESSIVE_CAST_AUTHORITY_POLICY_INVALID");
  }
  if (
    !Array.isArray(plan.roles)
    || plan.roles.length === 0
    || plan.roles.length > 512
  ) {
    throw new Error("EXPRESSIVE_CAST_ROLE_COUNT_INVALID");
  }
  if (
    !Array.isArray(plan.routes)
    || plan.routes.length === 0
    || plan.routes.length > 100_000
  ) {
    throw new Error("EXPRESSIVE_CAST_ROUTE_COUNT_INVALID");
  }

  const assignmentIds = new Set<string>();
  const roleIds = new Set<string>();
  const registrations = new Map<string, ExpressiveCastRoleRegistration>();
  for (const registration of plan.roles) {
    assertExpressiveCastRoleRegistration(registration);
    if (registration.binding.projectId !== plan.projectId) {
      throw new Error("EXPRESSIVE_CAST_ROLE_PROJECT_MISMATCH");
    }
    if (assignmentIds.has(registration.assignmentId)) {
      throw new Error("EXPRESSIVE_CAST_ASSIGNMENT_DUPLICATE");
    }
    if (roleIds.has(registration.binding.roleId)) {
      throw new Error("EXPRESSIVE_CAST_ROLE_ID_DUPLICATE");
    }
    assignmentIds.add(registration.assignmentId);
    roleIds.add(registration.binding.roleId);
    registrations.set(registration.assignmentId, registration);
  }
  assertExpressiveRoleEnsemble(
    plan.roles.map((registration) => registration.binding),
  );

  const narrator = registrations.get(plan.narratorAssignmentId);
  if (!narrator) {
    throw new Error("EXPRESSIVE_CAST_NARRATOR_ASSIGNMENT_NOT_FOUND");
  }
  if (narrator.binding.roleKind !== "narrator") {
    throw new Error("EXPRESSIVE_CAST_NARRATOR_ROLE_INVALID");
  }

  const routeIds = new Set<string>();
  const segmentIds = new Set<string>();
  const ordered = [...plan.routes].sort(compareRoutes);
  const previousByRole = new Map<
    string,
    Readonly<{ template: string; reuse: number }>
  >();
  const firstUseByRole = new Set<string>();

  for (let index = 0; index < ordered.length; index += 1) {
    const route = ordered[index]!;
    assertExpressiveCastRoute(route);
    if (routeIds.has(route.routeId)) {
      throw new Error("EXPRESSIVE_CAST_ROUTE_ID_DUPLICATE");
    }
    if (segmentIds.has(route.segmentId)) {
      throw new Error("EXPRESSIVE_CAST_SEGMENT_ROUTE_DUPLICATE");
    }
    routeIds.add(route.routeId);
    segmentIds.add(route.segmentId);
    const registration = registrations.get(route.roleAssignmentId);
    if (!registration) {
      throw new Error("EXPRESSIVE_CAST_ROUTE_ASSIGNMENT_UNKNOWN");
    }
    if (
      route.generation.role.fingerprint
        !== registration.binding.fingerprint
    ) {
      throw new Error("EXPRESSIVE_CAST_ROUTE_ROLE_BINDING_MISMATCH");
    }
    assertExpressiveRoleContinuity(
      registration.binding,
      route.generation.role,
    );
    if (
      route.utteranceKind === "narration"
      && route.roleAssignmentId !== plan.narratorAssignmentId
    ) {
      throw new Error("EXPRESSIVE_CAST_NARRATION_ROLE_MISMATCH");
    }
    if (
      route.utteranceKind !== "narration"
      && registration.binding.roleKind !== "character"
    ) {
      throw new Error("EXPRESSIVE_CAST_DIALOGUE_ROLE_MISMATCH");
    }
    if (index > 0 && sameRouteOrder(ordered[index - 1]!, route)) {
      throw new Error("EXPRESSIVE_CAST_ROUTE_ORDER_DUPLICATE");
    }
    if (!firstUseByRole.has(route.roleAssignmentId)) {
      if (
        route.chapterId !== registration.introducedChapterId
        || route.sceneId !== registration.introducedSceneId
      ) {
        throw new Error("EXPRESSIVE_CAST_ROLE_INTRODUCTION_MISMATCH");
      }
      firstUseByRole.add(route.roleAssignmentId);
    }

    const template = performanceTemplateFingerprint(route);
    const previous = previousByRole.get(route.roleAssignmentId);
    const reuse = previous?.template === template
      ? previous.reuse + 1
      : 1;
    if (reuse > EXPRESSIVE_CAST_MAXIMUM_TEMPLATE_REUSE) {
      throw new Error("EXPRESSIVE_CAST_CADENCE_TEMPLATE_OVERUSE");
    }
    previousByRole.set(
      route.roleAssignmentId,
      Object.freeze({ template, reuse }),
    );
  }

  if (
    plan.routes.some((route, index) => route.fingerprint !== ordered[index]?.fingerprint)
  ) {
    throw new Error("EXPRESSIVE_CAST_ROUTE_ORDER_NON_CANONICAL");
  }
}

function buildPlan(input: Readonly<{
  content: ExpressiveCastContinuityInput;
  revision: number;
  createdAt: string;
  updatedAt: string;
  previousFingerprint?: string;
}>): ExpressiveCastContinuityPlan {
  const roles = Object.freeze(
    input.content.roles
      .map((registration) =>
        createExpressiveCastRoleRegistration(registration)
      )
      .sort((left, right) =>
        left.assignmentId.localeCompare(right.assignmentId, "en-AU")
      ),
  );
  const routes = Object.freeze(
    input.content.routes
      .map((route) => createExpressiveCastRoute(route))
      .sort(compareRoutes),
  );
  const partial: Omit<ExpressiveCastContinuityPlan, "fingerprint"> = {
    schemaVersion: EXPRESSIVE_CAST_CONTINUITY_SCHEMA,
    projectId: input.content.projectId,
    bookId: input.content.bookId,
    sourceHash: input.content.sourceHash,
    revision: input.revision,
    narratorAssignmentId: input.content.narratorAssignmentId,
    roles,
    routes,
    approvedBy: input.content.approvedBy,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    ...(input.previousFingerprint
      ? { previousFingerprint: input.previousFingerprint }
      : {}),
    appendOnly: true,
    exactVoiceContinuityRequired: true,
    genericFallbackAllowed: false,
    automaticRecastAuthority: false,
    automaticPerformanceRewriteAuthority: false,
    titleReleaseAuthority: false,
    publicationAuthority: false,
  };
  validatePlanContent(partial);
  return Object.freeze({
    ...partial,
    fingerprint: stableHash(planBase(partial)),
  });
}

export function createExpressiveCastContinuityPlan(
  input: ExpressiveCastContinuityInput,
  now = new Date(),
): ExpressiveCastContinuityPlan {
  const timestamp = now.toISOString();
  return buildPlan({
    content: input,
    revision: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

export function assertExpressiveCastContinuityPlan(
  value: ExpressiveCastContinuityPlan,
): void {
  if (value.schemaVersion !== EXPRESSIVE_CAST_CONTINUITY_SCHEMA) {
    throw new Error("EXPRESSIVE_CAST_SCHEMA_UNSUPPORTED");
  }
  const { fingerprint, ...partial } = value;
  validatePlanContent(partial);
  if (
    !HASH.test(fingerprint)
    || fingerprint !== stableHash(planBase(partial))
  ) {
    throw new Error("EXPRESSIVE_CAST_FINGERPRINT_INVALID");
  }
}

export function assertExpressiveCastContinuityRevision(
  previous: ExpressiveCastContinuityPlan,
  next: ExpressiveCastContinuityPlan,
): void {
  assertExpressiveCastContinuityPlan(previous);
  assertExpressiveCastContinuityPlan(next);
  if (
    previous.projectId !== next.projectId
    || previous.bookId !== next.bookId
    || previous.sourceHash !== next.sourceHash
    || previous.narratorAssignmentId !== next.narratorAssignmentId
  ) {
    throw new Error("EXPRESSIVE_CAST_REVISION_SCOPE_MISMATCH");
  }
  if (
    next.revision !== previous.revision + 1
    || next.previousFingerprint !== previous.fingerprint
    || next.createdAt !== previous.createdAt
    || Date.parse(next.updatedAt) <= Date.parse(previous.updatedAt)
  ) {
    throw new Error("EXPRESSIVE_CAST_REVISION_LINEAGE_INVALID");
  }

  const nextRoles = new Map(
    next.roles.map((registration) => [
      registration.assignmentId,
      registration,
    ]),
  );
  for (const prior of previous.roles) {
    const current = nextRoles.get(prior.assignmentId);
    if (!current) {
      throw new Error("EXPRESSIVE_CAST_REVISION_ROLE_REMOVED");
    }
    assertExpressiveRoleContinuity(
      prior.binding,
      current.binding,
    );
    if (prior.binding.fingerprint !== current.binding.fingerprint) {
      throw new Error("EXPRESSIVE_CAST_REVISION_ROLE_REWRITTEN");
    }
  }
  if (next.routes.length < previous.routes.length) {
    throw new Error("EXPRESSIVE_CAST_REVISION_ROUTE_REMOVED");
  }
  for (let index = 0; index < previous.routes.length; index += 1) {
    if (
      previous.routes[index]?.fingerprint
      !== next.routes[index]?.fingerprint
    ) {
      throw new Error("EXPRESSIVE_CAST_REVISION_ROUTE_REWRITTEN");
    }
  }
}

export function createExpressiveCastContinuityRevision(
  previous: ExpressiveCastContinuityPlan,
  input: ExpressiveCastContinuityInput,
  now = new Date(),
): ExpressiveCastContinuityPlan {
  assertExpressiveCastContinuityPlan(previous);
  const next = buildPlan({
    content: input,
    revision: previous.revision + 1,
    createdAt: previous.createdAt,
    updatedAt: now.toISOString(),
    previousFingerprint: previous.fingerprint,
  });
  assertExpressiveCastContinuityRevision(previous, next);
  return next;
}

export function expressiveCastRouteForSegment(
  plan: ExpressiveCastContinuityPlan,
  segmentId: string,
): ExpressiveCastRoute {
  assertExpressiveCastContinuityPlan(plan);
  requireIdentifier(segmentId, "EXPRESSIVE_CAST_SEGMENT_ID_INVALID");
  const route = plan.routes.find(
    (candidate) => candidate.segmentId === segmentId,
  );
  if (!route) {
    throw new Error("EXPRESSIVE_CAST_SEGMENT_ROUTE_NOT_FOUND");
  }
  return route;
}

export function assertExpressiveCastRouteMaterial(
  plan: ExpressiveCastContinuityPlan,
  segmentId: string,
  material: ExpressiveCastRouteMaterialView,
): void {
  const route = expressiveCastRouteForSegment(plan, segmentId);
  if (material.immutableSourceHash !== plan.sourceHash) {
    throw new Error("EXPRESSIVE_CAST_MATERIAL_SOURCE_MISMATCH");
  }
  if (stableHash(material.text) !== route.segmentTextHash) {
    throw new Error("EXPRESSIVE_CAST_MATERIAL_TEXT_MISMATCH");
  }
  if (stableHash(material.direction) !== stableHash(route.direction)) {
    throw new Error("EXPRESSIVE_CAST_MATERIAL_DIRECTION_MISMATCH");
  }
  if (
    !material.expressivePerformance
    || material.expressivePerformance.fingerprint
      !== route.generation.fingerprint
  ) {
    throw new Error("EXPRESSIVE_CAST_MATERIAL_BINDING_MISMATCH");
  }
  if (
    material.voiceProfileHash === undefined
    || !sameVoice(
      {
        profileId: material.voiceProfileId,
        revision: material.voiceRevision,
        profileHash: material.voiceProfileHash,
      },
      route.generation.role.voice,
    )
  ) {
    throw new Error("EXPRESSIVE_CAST_MATERIAL_VOICE_MISMATCH");
  }
}

export function expressiveCastContinuityPublicView(
  plan: ExpressiveCastContinuityPlan,
): ExpressiveCastContinuityPublicView {
  assertExpressiveCastContinuityPlan(plan);
  return Object.freeze({
    schemaVersion: EXPRESSIVE_CAST_CONTINUITY_PUBLIC_SCHEMA,
    projectId: plan.projectId,
    bookId: plan.bookId,
    revision: plan.revision,
    roleCount: plan.roles.length,
    characterRoleCount: plan.roles.filter(
      (registration) => registration.binding.roleKind === "character",
    ).length,
    chapterCount: new Set(
      plan.routes.map((route) => route.chapterId),
    ).size,
    sceneCount: new Set(
      plan.routes.map((route) => `${route.chapterId}:${route.sceneId}`),
    ).size,
    routeCount: plan.routes.length,
    narratorRegistered: true,
    appendOnly: true,
    exactVoiceContinuityRequired: true,
    genericFallbackAllowed: false,
    automaticRecastAuthority: false,
    automaticPerformanceRewriteAuthority: false,
    titleReleaseAuthority: false,
    publicationAuthority: false,
    fingerprint: plan.fingerprint,
  });
}
