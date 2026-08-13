import assert from "node:assert/strict";
import test from "node:test";

import {
  stableHash,
  type GenerationJob,
  type PerformanceDirection,
} from "./index.js";
import {
  createExpressiveGenerationBinding,
  type ExpressiveGenerationBinding,
} from "./expressive-generation-binding.js";
import {
  buildGenerationWorkerRequests,
  type GenerationWorkerMaterial,
} from "./generation-worker.js";
import {
  createExpressivePerformancePlan,
  createExpressiveVoiceRoleBinding,
  type ExpressiveCadencePlan,
  type ExpressiveVoiceRoleBinding,
} from "./narration-expressive-performance.js";
import {
  assertExpressiveCastContinuityPlan,
  assertExpressiveCastContinuityRevision,
  assertExpressiveCastRouteMaterial,
  createExpressiveCastContinuityPlan,
  createExpressiveCastContinuityRevision,
  expressiveCastContinuityPublicView,
  expressiveCastRouteForSegment,
  type ExpressiveCastContinuityPlan,
} from "./expressive-cast-continuity.js";

const SOURCE_HASH = "1".repeat(64);
const RIGHTS_HASH = "2".repeat(64);
const NARRATOR_HASH = "3".repeat(64);
const ADA_HASH = "4".repeat(64);
const MALIK_HASH = "5".repeat(64);
const ANCHOR_NARRATOR = "6".repeat(64);
const ANCHOR_ADA = "7".repeat(64);
const ANCHOR_MALIK = "8".repeat(64);

const texts = Object.freeze({
  segment_001:
    "The corridor narrowed toward the locked room, carrying every footstep ahead of them.",
  segment_002:
    "I heard it before the lamps went out, Ada said, and I am not going back alone.",
  segment_003:
    "Then stop calling it imagination, Malik answered, because it has started answering us.",
  segment_004:
    "Neither of them moved when the latch lifted on the other side of the door.",
  segment_005:
    "Ada counted three breaths, steadied her voice, and asked who was waiting inside.",
  segment_006:
    "No one replied, but the floorboards beneath Malik shifted under a weight that was not his.",
  segment_007:
    "I am still here, Ada said, softer now, refusing to let the silence choose her cadence.",
});

type PlanInput = Parameters<typeof createExpressiveCastContinuityPlan>[0];
type RouteInput = PlanInput["routes"][number];
type RoleInput = PlanInput["roles"][number];

function direction(
  segmentId: string,
  input: Partial<Omit<PerformanceDirection, "segmentId">> = {},
): PerformanceDirection {
  return Object.freeze({
    segmentId,
    narrativeDistance: "close",
    pace: 0.82,
    intensity: 0.61,
    warmth: 0.48,
    restraint: 0.72,
    clarity: 0.94,
    pauseBeforeMs: 120,
    pauseAfterMs: 220,
    emotionalObjective:
      `Let ${segmentId} reveal pressure through restraint rather than manufactured volume.`,
    subtext:
      `The speaker in ${segmentId} is deciding what can safely be admitted to the listener.`,
    notes: Object.freeze([
      "Vary phrase length around the turn and protect the final clause.",
    ]),
    ...input,
  });
}

function cadence(
  targetWpm = 142,
  profile: ExpressiveCadencePlan["profile"] = "intimate",
): ExpressiveCadencePlan {
  return Object.freeze({
    profile,
    minimumWpm: targetWpm - 18,
    targetWpm,
    maximumWpm: targetWpm + 20,
    phraseLengthVariation: 0.44,
    pauseVariation: 0.36,
    minimumPitchRangeSemitones: 4.8,
    minimumDynamicRangeDb: 5.6,
    maximumCadenceTemplateSimilarity: 0.7,
    maximumSentenceFinalContourRepetitionRatio: 0.34,
  });
}

function role(input: Readonly<{
  roleId: string;
  roleKind: "narrator" | "character";
  displayName: string;
  characterId?: string;
  profileId: string;
  profileHash: string;
  voiceIdentityId: string;
  anchorHash: string;
  voiceStrategy?: "dedicated-voice" | "performance-variation";
}>): ExpressiveVoiceRoleBinding {
  return createExpressiveVoiceRoleBinding({
    projectId: "project_cast_continuity",
    roleId: input.roleId,
    roleKind: input.roleKind,
    ...(input.characterId ? { characterId: input.characterId } : {}),
    displayName: input.displayName,
    voice: {
      profileId: input.profileId,
      revision: 4,
      profileHash: input.profileHash,
    },
    voiceIdentityId: input.voiceIdentityId,
    engineKey: "audio_studio_expressive_v2",
    sourceRightsFingerprint: RIGHTS_HASH,
    voiceStrategy: input.voiceStrategy ?? "dedicated-voice",
    performanceAnchorHash: input.anchorHash,
    approvedBy: "casting_director",
    approvedAt: "2026-08-13T05:00:00.000Z",
  });
}

function standardRoles(): Readonly<{
  narrator: ExpressiveVoiceRoleBinding;
  ada: ExpressiveVoiceRoleBinding;
  malik: ExpressiveVoiceRoleBinding;
}> {
  return Object.freeze({
    narrator: role({
      roleId: "role_narrator",
      roleKind: "narrator",
      displayName: "Narrator",
      profileId: "voice_narrator",
      profileHash: NARRATOR_HASH,
      voiceIdentityId: "identity_narrator",
      anchorHash: ANCHOR_NARRATOR,
    }),
    ada: role({
      roleId: "role_ada",
      roleKind: "character",
      characterId: "character_ada",
      displayName: "Ada",
      profileId: "voice_ada",
      profileHash: ADA_HASH,
      voiceIdentityId: "identity_ada",
      anchorHash: ANCHOR_ADA,
    }),
    malik: role({
      roleId: "role_malik",
      roleKind: "character",
      characterId: "character_malik",
      displayName: "Malik",
      profileId: "voice_malik",
      profileHash: MALIK_HASH,
      voiceIdentityId: "identity_malik",
      anchorHash: ANCHOR_MALIK,
    }),
  });
}

function generation(
  binding: ExpressiveVoiceRoleBinding,
  segmentId: string,
  primaryEmotion: string,
  targetWpm: number,
  input: Partial<{
    secondaryEmotion: string;
    emotionalTrajectory:
      | "sustained"
      | "rising"
      | "falling"
      | "pivot"
      | "layered";
    emotionalIntensity: number;
    subtextIntent: string;
    cadenceProfile: ExpressiveCadencePlan["profile"];
  }> = {},
): Readonly<{
  direction: PerformanceDirection;
  binding: ExpressiveGenerationBinding;
}> {
  const directed = direction(segmentId, {
    pace: targetWpm / 170,
    intensity: input.emotionalIntensity ?? 0.65,
  });
  const performance = createExpressivePerformancePlan({
    role: binding,
    direction: directed,
    primaryEmotion,
    ...(input.secondaryEmotion
      ? { secondaryEmotion: input.secondaryEmotion }
      : {}),
    emotionalTrajectory: input.emotionalTrajectory ?? "layered",
    emotionalIntensity: input.emotionalIntensity ?? 0.65,
    subtextIntent:
      input.subtextIntent
      ?? `Let ${binding.displayName} pursue the immediate scene objective without flattening the contradiction underneath.`,
    cadence: cadence(targetWpm, input.cadenceProfile),
  });
  return Object.freeze({
    direction: directed,
    binding: createExpressiveGenerationBinding({
      role: binding,
      plan: performance,
      direction: directed,
    }),
  });
}

function route(input: Readonly<{
  routeId: string;
  chapterId?: string;
  chapterSequence?: number;
  sceneId?: string;
  sceneSequence?: number;
  utteranceSequence: number;
  segmentId: keyof typeof texts;
  utteranceKind: "narration" | "dialogue" | "internal-monologue";
  roleAssignmentId: string;
  role: ExpressiveVoiceRoleBinding;
  primaryEmotion: string;
  targetWpm: number;
  performanceBeat: string;
  secondaryEmotion?: string;
}>): RouteInput {
  const prepared = generation(
    input.role,
    input.segmentId,
    input.primaryEmotion,
    input.targetWpm,
    input.secondaryEmotion
      ? { secondaryEmotion: input.secondaryEmotion }
      : {},
  );
  return Object.freeze({
    routeId: input.routeId,
    chapterId: input.chapterId ?? "chapter_001",
    chapterSequence: input.chapterSequence ?? 1,
    sceneId: input.sceneId ?? "scene_001",
    sceneSequence: input.sceneSequence ?? 1,
    utteranceSequence: input.utteranceSequence,
    segmentId: input.segmentId,
    segmentTextHash: stableHash(texts[input.segmentId]),
    utteranceKind: input.utteranceKind,
    roleAssignmentId: input.roleAssignmentId,
    direction: prepared.direction,
    generation: prepared.binding,
    performanceBeat: input.performanceBeat,
  });
}

function roleInput(
  assignmentId: string,
  binding: ExpressiveVoiceRoleBinding,
  introducedSceneId = "scene_001",
  introducedChapterId = "chapter_001",
): RoleInput {
  return Object.freeze({
    assignmentId,
    binding,
    introducedChapterId,
    introducedSceneId,
  });
}

function fixtureInput(): PlanInput {
  const roles = standardRoles();
  return Object.freeze({
    projectId: "project_cast_continuity",
    bookId: "book_cast_continuity",
    sourceHash: SOURCE_HASH,
    narratorAssignmentId: "assignment_narrator",
    roles: Object.freeze([
      roleInput("assignment_narrator", roles.narrator),
      roleInput("assignment_ada", roles.ada),
      roleInput("assignment_malik", roles.malik),
    ]),
    routes: Object.freeze([
      route({
        routeId: "route_001",
        utteranceSequence: 1,
        segmentId: "segment_001",
        utteranceKind: "narration",
        roleAssignmentId: "assignment_narrator",
        role: roles.narrator,
        primaryEmotion: "watchful unease",
        targetWpm: 136,
        performanceBeat:
          "Observe the narrowing corridor, then let the final image carry a restrained warning.",
      }),
      route({
        routeId: "route_002",
        utteranceSequence: 2,
        segmentId: "segment_002",
        utteranceKind: "dialogue",
        roleAssignmentId: "assignment_ada",
        role: roles.ada,
        primaryEmotion: "contained fear",
        secondaryEmotion: "stubborn resolve",
        targetWpm: 148,
        performanceBeat:
          "Keep Ada controlled through the first admission, then harden her resolve on the final clause.",
      }),
      route({
        routeId: "route_003",
        utteranceSequence: 3,
        segmentId: "segment_003",
        utteranceKind: "dialogue",
        roleAssignmentId: "assignment_malik",
        role: roles.malik,
        primaryEmotion: "defensive patience",
        secondaryEmotion: "suppressed alarm",
        targetWpm: 154,
        performanceBeat:
          "Let Malik answer too quickly, then slow enough for the warning to become unmistakable.",
      }),
      route({
        routeId: "route_004",
        sceneId: "scene_002",
        sceneSequence: 2,
        utteranceSequence: 1,
        segmentId: "segment_004",
        utteranceKind: "narration",
        roleAssignmentId: "assignment_narrator",
        role: roles.narrator,
        primaryEmotion: "gathering dread",
        targetWpm: 128,
        performanceBeat:
          "Broaden the silence around both characters and leave the lifted latch almost unvoiced.",
      }),
    ]),
    approvedBy: "performance_director",
  });
}

function createFixture(
  timestamp = "2026-08-13T05:30:00.000Z",
): ExpressiveCastContinuityPlan {
  return createExpressiveCastContinuityPlan(
    fixtureInput(),
    new Date(timestamp),
  );
}

test("a canonical book plan routes narration and dialogue to exact approved role voices", () => {
  const plan = createFixture();
  assertExpressiveCastContinuityPlan(plan);
  assert.equal(plan.revision, 1);
  assert.equal(plan.roles.length, 3);
  assert.equal(plan.routes.length, 4);
  assert.equal(plan.appendOnly, true);
  assert.equal(plan.exactVoiceContinuityRequired, true);
  assert.equal(plan.genericFallbackAllowed, false);
  assert.equal(plan.automaticRecastAuthority, false);
  assert.equal(plan.publicationAuthority, false);

  const adaRoute = expressiveCastRouteForSegment(plan, "segment_002");
  assert.equal(adaRoute.roleAssignmentId, "assignment_ada");
  assert.equal(adaRoute.generation.role.characterId, "character_ada");
  assert.equal(adaRoute.generation.role.voice.profileId, "voice_ada");
  assert.equal(adaRoute.generation.plan.primaryEmotion, "contained fear");

  const same = createFixture();
  assert.equal(same.fingerprint, plan.fingerprint);
  assert.deepEqual(same.routes, plan.routes);
});

test("narration cannot be routed to a character and dialogue cannot collapse into the narrator", () => {
  const input = fixtureInput();
  const roles = standardRoles();
  const wrongNarration = route({
    routeId: "route_wrong_narration",
    utteranceSequence: 1,
    segmentId: "segment_001",
    utteranceKind: "narration",
    roleAssignmentId: "assignment_ada",
    role: roles.ada,
    primaryEmotion: "guarded suspicion",
    targetWpm: 142,
    performanceBeat:
      "Let Ada observe the corridor while resisting the urge to turn the line into direct confession.",
  });
  assert.throws(
    () => createExpressiveCastContinuityPlan({
      ...input,
      routes: [wrongNarration, ...input.routes.slice(1)],
    }),
    /EXPRESSIVE_CAST_NARRATION_ROLE_MISMATCH/u,
  );

  const wrongDialogue = route({
    routeId: "route_wrong_dialogue",
    utteranceSequence: 2,
    segmentId: "segment_002",
    utteranceKind: "dialogue",
    roleAssignmentId: "assignment_narrator",
    role: roles.narrator,
    primaryEmotion: "restrained concern",
    targetWpm: 140,
    performanceBeat:
      "Keep the line in direct speech but refuse the narrator permission to impersonate Ada.",
  });
  assert.throws(
    () => createExpressiveCastContinuityPlan({
      ...input,
      routes: [
        input.routes[0]!,
        wrongDialogue,
        ...input.routes.slice(2),
      ],
    }),
    /EXPRESSIVE_CAST_DIALOGUE_ROLE_MISMATCH/u,
  );
});

test("a rehashed route cannot hide a silent character recast", () => {
  const input = fixtureInput();
  const original = standardRoles();
  const recastAda = role({
    roleId: "role_ada",
    roleKind: "character",
    characterId: "character_ada",
    displayName: "Ada",
    profileId: "voice_ada_replacement",
    profileHash: "9".repeat(64),
    voiceIdentityId: "identity_ada_replacement",
    anchorHash: "a".repeat(64),
  });
  const recastRoute = route({
    routeId: "route_002",
    utteranceSequence: 2,
    segmentId: "segment_002",
    utteranceKind: "dialogue",
    roleAssignmentId: "assignment_ada",
    role: recastAda,
    primaryEmotion: "contained fear",
    targetWpm: 148,
    performanceBeat:
      "Keep Ada controlled through the first admission, then harden her resolve on the final clause.",
  });
  assert.notEqual(
    recastRoute.generation.role.fingerprint,
    original.ada.fingerprint,
  );
  assert.throws(
    () => createExpressiveCastContinuityPlan({
      ...input,
      routes: [
        input.routes[0]!,
        recastRoute,
        ...input.routes.slice(2),
      ],
    }),
    /EXPRESSIVE_CAST_ROUTE_ROLE_BINDING_MISMATCH/u,
  );
});

test("dedicated character assignments cannot collapse onto the same exact voice", () => {
  const narrator = standardRoles().narrator;
  const sharedAda = role({
    roleId: "role_ada",
    roleKind: "character",
    characterId: "character_ada",
    displayName: "Ada",
    profileId: "voice_shared",
    profileHash: ADA_HASH,
    voiceIdentityId: "identity_shared",
    anchorHash: ANCHOR_ADA,
  });
  const sharedMalik = role({
    roleId: "role_malik",
    roleKind: "character",
    characterId: "character_malik",
    displayName: "Malik",
    profileId: "voice_shared",
    profileHash: ADA_HASH,
    voiceIdentityId: "identity_shared",
    anchorHash: ANCHOR_MALIK,
  });
  const input = fixtureInput();
  assert.throws(
    () => createExpressiveCastContinuityPlan({
      ...input,
      roles: [
        roleInput("assignment_narrator", narrator),
        roleInput("assignment_ada", sharedAda),
        roleInput("assignment_malik", sharedMalik),
      ],
    }),
    /EXPRESSIVE_DEDICATED_CHARACTER_VOICE_COLLAPSE/u,
  );
});

test("one performer may carry multiple characters only with distinct governed performance anchors", () => {
  const narrator = role({
    roleId: "role_narrator",
    roleKind: "narrator",
    displayName: "Narrator",
    profileId: "voice_single_performer",
    profileHash: NARRATOR_HASH,
    voiceIdentityId: "identity_single_performer",
    anchorHash: ANCHOR_NARRATOR,
    voiceStrategy: "performance-variation",
  });
  const ada = role({
    roleId: "role_ada",
    roleKind: "character",
    characterId: "character_ada",
    displayName: "Ada",
    profileId: "voice_single_performer",
    profileHash: NARRATOR_HASH,
    voiceIdentityId: "identity_single_performer",
    anchorHash: ANCHOR_ADA,
    voiceStrategy: "performance-variation",
  });
  const malik = role({
    roleId: "role_malik",
    roleKind: "character",
    characterId: "character_malik",
    displayName: "Malik",
    profileId: "voice_single_performer",
    profileHash: NARRATOR_HASH,
    voiceIdentityId: "identity_single_performer",
    anchorHash: ANCHOR_MALIK,
    voiceStrategy: "performance-variation",
  });
  const input = fixtureInput();
  const routes: readonly RouteInput[] = [
    route({
      routeId: "route_single_001",
      utteranceSequence: 1,
      segmentId: "segment_001",
      utteranceKind: "narration",
      roleAssignmentId: "assignment_narrator",
      role: narrator,
      primaryEmotion: "watchful unease",
      targetWpm: 136,
      performanceBeat:
        "Hold the narrator above the scene while keeping the warning contained in the last phrase.",
    }),
    route({
      routeId: "route_single_002",
      utteranceSequence: 2,
      segmentId: "segment_002",
      utteranceKind: "dialogue",
      roleAssignmentId: "assignment_ada",
      role: ada,
      primaryEmotion: "contained fear",
      targetWpm: 148,
      performanceBeat:
        "Move into Ada through a tighter onset and a firmer landing without changing the base performer.",
    }),
    route({
      routeId: "route_single_003",
      utteranceSequence: 3,
      segmentId: "segment_003",
      utteranceKind: "dialogue",
      roleAssignmentId: "assignment_malik",
      role: malik,
      primaryEmotion: "defensive patience",
      targetWpm: 154,
      performanceBeat:
        "Give Malik a broader phrase shape and slower warning while preserving the approved base voice.",
    }),
  ];
  const plan = createExpressiveCastContinuityPlan({
    ...input,
    roles: [
      roleInput("assignment_narrator", narrator),
      roleInput("assignment_ada", ada),
      roleInput("assignment_malik", malik),
    ],
    routes,
  });
  assertExpressiveCastContinuityPlan(plan);

  const collapsedMalik = role({
    roleId: "role_malik",
    roleKind: "character",
    characterId: "character_malik",
    displayName: "Malik",
    profileId: "voice_single_performer",
    profileHash: NARRATOR_HASH,
    voiceIdentityId: "identity_single_performer",
    anchorHash: ANCHOR_ADA,
    voiceStrategy: "performance-variation",
  });
  assert.throws(
    () => createExpressiveCastContinuityPlan({
      ...input,
      roles: [
        roleInput("assignment_narrator", narrator),
        roleInput("assignment_ada", ada),
        roleInput("assignment_malik", collapsedMalik),
      ],
      routes,
    }),
    /EXPRESSIVE_CHARACTER_PERFORMANCE_ANCHOR_COLLAPSE/u,
  );
});

test("generic direction labels and repeated performance templates fail before generation", () => {
  const input = fixtureInput();
  const genericRoute = {
    ...input.routes[1]!,
    performanceBeat: "read naturally",
  };
  assert.throws(
    () => createExpressiveCastContinuityPlan({
      ...input,
      routes: [
        input.routes[0]!,
        genericRoute,
        ...input.routes.slice(2),
      ],
    }),
    /EXPRESSIVE_CAST_PERFORMANCE_BEAT_GENERIC/u,
  );

  const roles = standardRoles();
  const repeatedAdaRoutes: readonly RouteInput[] = [
    input.routes[0]!,
    route({
      routeId: "route_repeat_001",
      utteranceSequence: 2,
      segmentId: "segment_002",
      utteranceKind: "dialogue",
      roleAssignmentId: "assignment_ada",
      role: roles.ada,
      primaryEmotion: "contained fear",
      targetWpm: 148,
      performanceBeat:
        "Keep the first admission restrained and let resolve arrive only in the closing clause.",
    }),
    route({
      routeId: "route_repeat_002",
      utteranceSequence: 3,
      segmentId: "segment_005",
      utteranceKind: "dialogue",
      roleAssignmentId: "assignment_ada",
      role: roles.ada,
      primaryEmotion: "contained fear",
      targetWpm: 148,
      performanceBeat:
        "Use the same emotional pressure but locate the turn in the counted breaths before the question.",
    }),
    route({
      routeId: "route_repeat_003",
      utteranceSequence: 4,
      segmentId: "segment_007",
      utteranceKind: "dialogue",
      roleAssignmentId: "assignment_ada",
      role: roles.ada,
      primaryEmotion: "contained fear",
      targetWpm: 148,
      performanceBeat:
        "Keep Ada soft without flattening her refusal to let the surrounding silence choose the rhythm.",
    }),
  ];
  assert.throws(
    () => createExpressiveCastContinuityPlan({
      ...input,
      roles: [
        roleInput("assignment_narrator", roles.narrator),
        roleInput("assignment_ada", roles.ada),
      ],
      routes: repeatedAdaRoutes,
    }),
    /EXPRESSIVE_CAST_CADENCE_TEMPLATE_OVERUSE/u,
  );
});

test("the exact cast route binds normal generation material and worker requests", () => {
  const plan = createFixture();
  const selected = expressiveCastRouteForSegment(plan, "segment_002");
  const job: GenerationJob = {
    id: "job_cast_ada_001",
    projectId: plan.projectId,
    segmentId: selected.segmentId,
    providerFallbackIds: ["expressive-provider"],
    cacheKey: "b".repeat(64),
    candidateCount: 3,
    status: "ready",
  };
  const material: GenerationWorkerMaterial = {
    text: texts.segment_002,
    immutableSourceHash: plan.sourceHash,
    voiceProfileId: selected.generation.role.voice.profileId,
    voiceRevision: selected.generation.role.voice.revision,
    voiceProfileHash: selected.generation.role.voice.profileHash,
    direction: selected.direction,
    mode: "production",
    format: "wav",
    sampleRateHz: 48_000,
    rights: {
      rightsEvidenceId: "rights_cast_ada_001",
      rightsFingerprint: RIGHTS_HASH,
      allowedUses: ["audiobook"],
      commercialUseApproved: true,
      expiresAt: "2028-08-13T00:00:00.000Z",
    },
    intendedUse: "audiobook",
    commercial: true,
    expressivePerformance: selected.generation,
  };

  assert.doesNotThrow(() =>
    assertExpressiveCastRouteMaterial(
      plan,
      selected.segmentId,
      material,
    )
  );
  const requests = buildGenerationWorkerRequests(job, material);
  assert.equal(requests.length, 3);
  assert.equal(
    requests.every((request) =>
      request.voiceProfileId === "voice_ada"
      && request.voiceProfileHash === ADA_HASH
      && request.metadata.expressiveCharacterId === "character_ada"
      && request.metadata.expressiveGenericFallbackAllowed === "false"
    ),
    true,
  );
  assert.equal(new Set(requests.map((request) => request.requestId)).size, 3);

  assert.throws(
    () => assertExpressiveCastRouteMaterial(
      plan,
      selected.segmentId,
      { ...material, text: "Different dialogue was substituted." },
    ),
    /EXPRESSIVE_CAST_MATERIAL_TEXT_MISMATCH/u,
  );
  assert.throws(
    () => assertExpressiveCastRouteMaterial(
      plan,
      selected.segmentId,
      {
        ...material,
        voiceProfileId: "voice_substitute",
        voiceProfileHash: "c".repeat(64),
      },
    ),
    /EXPRESSIVE_CAST_MATERIAL_VOICE_MISMATCH/u,
  );
});

test("continuity revisions are append-only and cannot rewrite an established role or route", () => {
  const previous = createFixture("2026-08-13T05:30:00.000Z");
  const input = fixtureInput();
  const ada = standardRoles().ada;
  const appended = route({
    routeId: "route_005",
    sceneId: "scene_002",
    sceneSequence: 2,
    utteranceSequence: 2,
    segmentId: "segment_005",
    utteranceKind: "dialogue",
    roleAssignmentId: "assignment_ada",
    role: ada,
    primaryEmotion: "measured courage",
    targetWpm: 137,
    performanceBeat:
      "Let Ada count the breaths as a private metronome, then make the question steadier than she feels.",
  });
  const next = createExpressiveCastContinuityRevision(
    previous,
    {
      ...input,
      routes: [...input.routes, appended],
      approvedBy: "performance_director_revision_002",
    },
    new Date("2026-08-13T06:00:00.000Z"),
  );
  assert.equal(next.revision, 2);
  assert.equal(next.previousFingerprint, previous.fingerprint);
  assert.equal(next.routes.length, previous.routes.length + 1);
  assertExpressiveCastContinuityRevision(previous, next);

  assert.throws(
    () => createExpressiveCastContinuityRevision(
      previous,
      {
        ...input,
        routes: [
          {
            ...input.routes[0]!,
            performanceBeat:
              "Rewrite the already approved narrator beat after production without preserving its original evidence.",
          },
          ...input.routes.slice(1),
          appended,
        ],
      },
      new Date("2026-08-13T06:00:00.000Z"),
    ),
    /EXPRESSIVE_CAST_REVISION_ROUTE_REWRITTEN/u,
  );

  assert.throws(
    () => createExpressiveCastContinuityRevision(
      previous,
      {
        ...input,
        roles: input.roles.filter(
          (registration) =>
            registration.assignmentId !== "assignment_malik",
        ),
        routes: input.routes.filter(
          (candidate) =>
            candidate.roleAssignmentId !== "assignment_malik",
        ),
      },
      new Date("2026-08-13T06:00:00.000Z"),
    ),
    /EXPRESSIVE_CAST_REVISION_ROLE_REMOVED|EXPRESSIVE_CAST_REVISION_ROUTE_REWRITTEN/u,
  );
});

test("a full revision cannot recast Ada even when every replacement route is internally rehashed", () => {
  const previous = createFixture("2026-08-13T05:30:00.000Z");
  const input = fixtureInput();
  const roles = standardRoles();
  const recastAda = role({
    roleId: "role_ada",
    roleKind: "character",
    characterId: "character_ada",
    displayName: "Ada",
    profileId: "voice_ada_recast",
    profileHash: "d".repeat(64),
    voiceIdentityId: "identity_ada_recast",
    anchorHash: "e".repeat(64),
  });
  const rewrittenRoutes = input.routes.map((candidate) => {
    if (candidate.roleAssignmentId !== "assignment_ada") {
      return candidate;
    }
    return route({
      routeId: candidate.routeId,
      chapterId: candidate.chapterId,
      chapterSequence: candidate.chapterSequence,
      sceneId: candidate.sceneId,
      sceneSequence: candidate.sceneSequence,
      utteranceSequence: candidate.utteranceSequence,
      segmentId: candidate.segmentId as keyof typeof texts,
      utteranceKind: candidate.utteranceKind,
      roleAssignmentId: candidate.roleAssignmentId,
      role: recastAda,
      primaryEmotion: candidate.generation.plan.primaryEmotion,
      targetWpm: candidate.generation.plan.cadence.targetWpm,
      performanceBeat: candidate.performanceBeat,
      ...(candidate.generation.plan.secondaryEmotion
        ? { secondaryEmotion: candidate.generation.plan.secondaryEmotion }
        : {}),
    });
  });
  assert.throws(
    () => createExpressiveCastContinuityRevision(
      previous,
      {
        ...input,
        roles: [
          roleInput("assignment_narrator", roles.narrator),
          roleInput("assignment_ada", recastAda),
          roleInput("assignment_malik", roles.malik),
        ],
        routes: rewrittenRoutes,
      },
      new Date("2026-08-13T06:00:00.000Z"),
    ),
    /EXPRESSIVE_ROLE_CONTINUITY_MISMATCH|EXPRESSIVE_CAST_REVISION_ROLE_REWRITTEN/u,
  );
});

test("route identifiers, segments, order and first appearances are deterministic", () => {
  const input = fixtureInput();
  assert.throws(
    () => createExpressiveCastContinuityPlan({
      ...input,
      routes: [
        input.routes[0]!,
        { ...input.routes[1]!, routeId: input.routes[0]!.routeId },
        ...input.routes.slice(2),
      ],
    }),
    /EXPRESSIVE_CAST_ROUTE_ID_DUPLICATE/u,
  );
  assert.throws(
    () => createExpressiveCastContinuityPlan({
      ...input,
      routes: [
        input.routes[0]!,
        {
          ...input.routes[1]!,
          segmentId: input.routes[0]!.segmentId,
          direction: input.routes[0]!.direction,
          generation: input.routes[0]!.generation,
          segmentTextHash: input.routes[0]!.segmentTextHash,
        },
        ...input.routes.slice(2),
      ],
    }),
    /EXPRESSIVE_CAST_SEGMENT_ROUTE_DUPLICATE|EXPRESSIVE_CAST_ROUTE_ROLE_BINDING_MISMATCH/u,
  );
  assert.throws(
    () => createExpressiveCastContinuityPlan({
      ...input,
      roles: input.roles.map((registration) =>
        registration.assignmentId === "assignment_ada"
          ? { ...registration, introducedSceneId: "scene_999" }
          : registration
      ),
    }),
    /EXPRESSIVE_CAST_ROLE_INTRODUCTION_MISMATCH/u,
  );
});

test("public continuity state omits voices, character names, subtext and line-level direction", () => {
  const plan = createFixture();
  const view = expressiveCastContinuityPublicView(plan);
  assert.equal(view.roleCount, 3);
  assert.equal(view.characterRoleCount, 2);
  assert.equal(view.chapterCount, 1);
  assert.equal(view.sceneCount, 2);
  assert.equal(view.routeCount, 4);
  assert.equal(view.genericFallbackAllowed, false);
  assert.equal(view.automaticRecastAuthority, false);
  assert.equal(view.automaticPerformanceRewriteAuthority, false);
  assert.equal(view.titleReleaseAuthority, false);
  assert.equal(view.publicationAuthority, false);

  const serialised = JSON.stringify(view);
  for (const secret of [
    "Ada",
    "Malik",
    "voice_ada",
    ADA_HASH,
    ANCHOR_ADA,
    "contained fear",
    "stubborn resolve",
    "Keep Ada controlled",
    texts.segment_002,
  ]) {
    assert.equal(serialised.includes(secret), false);
  }
});
