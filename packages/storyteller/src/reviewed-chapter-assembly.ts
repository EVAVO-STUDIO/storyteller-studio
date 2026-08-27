import {
  assertChapterAssemblyPlan,
  createChapterAssemblyPlan,
  type ChapterAssemblyPlan,
  type CreateChapterAssemblyInput,
} from "./chapter-assembly.js";
import { stableHash } from "./index.js";
import {
  assertNarrationCandidateSelection,
  type NarrationCandidateSelection,
} from "./narration-candidate-selection.js";

export const REVIEWED_CHAPTER_ASSEMBLY_ADMISSION_SCHEMA =
  "storyteller-reviewed-chapter-assembly-admission-v1" as const;

export interface ReviewedChapterAssemblyAdmission {
  schemaVersion: typeof REVIEWED_CHAPTER_ASSEMBLY_ADMISSION_SCHEMA;
  id: string;
  projectId: string;
  chapterId: string;
  chapterAssemblyFingerprint: string;
  manuscriptSourceHash: string;
  segmentIds: readonly string[];
  selectionFingerprints: readonly string[];
  admittedByActorId: string;
  admittedAt: string;
  humanListeningApprovalBound: true;
  titleReleaseAuthority: false;
  publicationAuthority: false;
  fingerprint: string;
}

export interface ReviewedChapterAssembly {
  plan: ChapterAssemblyPlan;
  admission: ReviewedChapterAssemblyAdmission;
}

export class ReviewedChapterAssemblyError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = "ReviewedChapterAssemblyError";
    this.code = code;
  }
}

const HASH = /^[a-f0-9]{64}$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const HUMAN_BLOCKLIST = /^(?:system|worker|automation|automated|bot)(?:[_-]|$)/iu;

function id(value: string, code: string): string {
  if (!ID.test(value)) throw new ReviewedChapterAssemblyError(code);
  return value;
}
function human(value: string, code: string): string {
  id(value, code);
  if (HUMAN_BLOCKLIST.test(value)) throw new ReviewedChapterAssemblyError(code);
  return value;
}
function base(value: Omit<ReviewedChapterAssemblyAdmission, "fingerprint">) {
  return { ...value, segmentIds: [...value.segmentIds], selectionFingerprints: [...value.selectionFingerprints] };
}
function match(plan: ChapterAssemblyPlan, selection: NarrationCandidateSelection): NarrationCandidateSelection {
  assertNarrationCandidateSelection(selection);
  if (selection.projectId !== plan.projectId || selection.sourceContentHash !== plan.manuscriptSourceHash) {
    throw new ReviewedChapterAssemblyError("REVIEWED_ASSEMBLY_SELECTION_PROJECT_MISMATCH");
  }
  const segment = plan.segments.find((value) => value.segmentId === selection.segmentId);
  if (!segment) throw new ReviewedChapterAssemblyError("REVIEWED_ASSEMBLY_SELECTION_SEGMENT_MISSING");
  if (selection.selectedTakeId !== segment.takeId || selection.selectedAudioArtifactId !== segment.audio.id
    || selection.selectedAudioArtifactFingerprint !== segment.audio.fingerprint
    || selection.selectedAudioContentHash !== segment.audio.contentHash) {
    throw new ReviewedChapterAssemblyError("REVIEWED_ASSEMBLY_SELECTED_ARTIFACT_MISMATCH");
  }
  if (Date.parse(selection.approvedAt) > Date.parse(plan.createdAt)) {
    throw new ReviewedChapterAssemblyError("REVIEWED_ASSEMBLY_SELECTION_APPROVED_AFTER_ASSEMBLY");
  }
  return selection;
}

export function createReviewedChapterAssemblyAdmission(input: Readonly<{
  id: string;
  plan: ChapterAssemblyPlan;
  selections: readonly NarrationCandidateSelection[];
  admittedByActorId: string;
  admittedAt?: Date;
}>): ReviewedChapterAssemblyAdmission {
  assertChapterAssemblyPlan(input.plan);
  id(input.id, "REVIEWED_ASSEMBLY_ADMISSION_ID_INVALID");
  const admittedByActorId = human(input.admittedByActorId, "REVIEWED_ASSEMBLY_ADMISSION_ACTOR_INVALID");
  const admittedAt = input.admittedAt ?? new Date(input.plan.createdAt);
  if (Number.isNaN(admittedAt.getTime()) || admittedAt.getTime() < Date.parse(input.plan.createdAt)) {
    throw new ReviewedChapterAssemblyError("REVIEWED_ASSEMBLY_ADMISSION_DATE_INVALID");
  }
  if (!Array.isArray(input.selections) || input.selections.length !== input.plan.segments.length) {
    throw new ReviewedChapterAssemblyError("REVIEWED_ASSEMBLY_SELECTION_COUNT_MISMATCH");
  }
  const bySegment = new Map<string, NarrationCandidateSelection>();
  for (const selection of input.selections) {
    const checked = match(input.plan, selection);
    if (bySegment.has(checked.segmentId)) {
      throw new ReviewedChapterAssemblyError("REVIEWED_ASSEMBLY_SELECTION_DUPLICATE");
    }
    bySegment.set(checked.segmentId, checked);
  }
  const ordered = input.plan.segments.map((segment) => {
    const selection = bySegment.get(segment.segmentId);
    if (!selection) throw new ReviewedChapterAssemblyError("REVIEWED_ASSEMBLY_SELECTION_MISSING");
    return selection;
  });
  const partial: Omit<ReviewedChapterAssemblyAdmission, "fingerprint"> = {
    schemaVersion: REVIEWED_CHAPTER_ASSEMBLY_ADMISSION_SCHEMA,
    id: input.id,
    projectId: input.plan.projectId,
    chapterId: input.plan.chapterId,
    chapterAssemblyFingerprint: input.plan.fingerprint,
    manuscriptSourceHash: input.plan.manuscriptSourceHash,
    segmentIds: Object.freeze(input.plan.segments.map((segment) => segment.segmentId)),
    selectionFingerprints: Object.freeze(ordered.map((selection) => selection.fingerprint)),
    admittedByActorId,
    admittedAt: admittedAt.toISOString(),
    humanListeningApprovalBound: true,
    titleReleaseAuthority: false,
    publicationAuthority: false,
  };
  return Object.freeze({ ...partial, fingerprint: stableHash(base(partial)) });
}

export function assertReviewedChapterAssemblyAdmission(
  value: ReviewedChapterAssemblyAdmission,
  plan: ChapterAssemblyPlan,
  selections: readonly NarrationCandidateSelection[],
): void {
  if (value.schemaVersion !== REVIEWED_CHAPTER_ASSEMBLY_ADMISSION_SCHEMA) {
    throw new ReviewedChapterAssemblyError("REVIEWED_ASSEMBLY_ADMISSION_SCHEMA_UNSUPPORTED");
  }
  const { fingerprint, ...partial } = value;
  if (!HASH.test(fingerprint) || stableHash(base(partial)) !== fingerprint) {
    throw new ReviewedChapterAssemblyError("REVIEWED_ASSEMBLY_ADMISSION_FINGERPRINT_INVALID");
  }
  const recreated = createReviewedChapterAssemblyAdmission({
    id: value.id,
    plan,
    selections,
    admittedByActorId: value.admittedByActorId,
    admittedAt: new Date(value.admittedAt),
  });
  if (recreated.fingerprint !== fingerprint) {
    throw new ReviewedChapterAssemblyError("REVIEWED_ASSEMBLY_ADMISSION_CONTRACT_MISMATCH");
  }
}

export function createReviewedChapterAssembly(input: Readonly<{
  assembly: CreateChapterAssemblyInput;
  selections: readonly NarrationCandidateSelection[];
  admissionId: string;
  admittedByActorId: string;
  admittedAt?: Date;
}>): ReviewedChapterAssembly {
  const plan = createChapterAssemblyPlan(input.assembly);
  const admission = createReviewedChapterAssemblyAdmission({
    id: input.admissionId,
    plan,
    selections: input.selections,
    admittedByActorId: input.admittedByActorId,
    ...(input.admittedAt ? { admittedAt: input.admittedAt } : {}),
  });
  return Object.freeze({ plan, admission });
}
