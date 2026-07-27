import { createHash } from "node:crypto";
import {
  ingestAudioEngineeringArtifact,
  type AudioEngineeringArtifactResult,
} from "./audio-engineering-artifact.js";
import {
  assertChapterRenderEvidence,
  type ChapterRenderEvidence,
  type ChapterRenderResult,
} from "./chapter-render.js";
import {
  assertChapterAssemblyPlan,
  type ChapterAssemblyPlan,
} from "./chapter-assembly.js";
import {
  ingestPrivateArtifact,
  type ArtifactIngestResult,
} from "./artifact-ingest.js";
import {
  quarantineArtifact,
  type ArtifactRecord,
  type ArtifactRightsSnapshot,
} from "./artifact-registry.js";
import type { FileArtifactRegistry } from "./artifact-store.js";
import type { GenerationAudioEngineeringPolicy } from "./generation-audio-engineering.js";
import { stableHash, type Finding } from "./index.js";
import type { FilePrivateObjectStore } from "./private-object-store.js";
import type { StoredEnvelope } from "./project-store.js";

export const CHAPTER_MASTER_SCHEMA_VERSION = "storyteller-chapter-master-v1" as const;

export interface IngestChapterMasterInput {
  plan: ChapterAssemblyPlan;
  render: ChapterRenderResult;
  rights: ArtifactRightsSnapshot;
  actorId: string;
  verifierActorId?: string;
  engineering: GenerationAudioEngineeringPolicy;
  maximumDurationDriftMs?: number;
  now?: Date;
  signal?: AbortSignal;
}

export interface ChapterMasterArtifactChain {
  schemaVersion: typeof CHAPTER_MASTER_SCHEMA_VERSION;
  planId: string;
  planFingerprint: string;
  assemblyManifest: StoredEnvelope<ArtifactRecord>;
  renderEvidence: StoredEnvelope<ArtifactRecord>;
  chapterMaster: StoredEnvelope<ArtifactRecord>;
  postRenderEngineering: AudioEngineeringArtifactResult;
  expectedDurationMs: number;
  observedDurationMs: number;
  durationDriftMs: number;
  eligibleForReview: boolean;
  findingCodes: readonly string[];
  fingerprint: string;
}

export interface ChapterMasterPublicView {
  planId: string;
  planFingerprint: string;
  chapterId: string;
  masterArtifactId: string;
  masterRevision: number;
  verificationStatus: ArtifactRecord["verification"]["status"];
  reviewStatus: ArtifactRecord["review"]["status"];
  engineeringProfileId: string;
  engineeringProfileVersion: string;
  observedDurationMs: number;
  expectedDurationMs: number;
  durationDriftMs: number;
  eligibleForReview: boolean;
  findingCodes: readonly string[];
  fingerprint: string;
}

export class ChapterMasterError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "ChapterMasterError";
    this.code = code;
  }
}

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const DEFAULT_DURATION_DRIFT_MS = 100;
const MAXIMUM_DURATION_DRIFT_MS = 5_000;

function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function requireIdentifier(value: string, code: string): string {
  if (!SAFE_IDENTIFIER.test(value)) throw new ChapterMasterError(code);
  return value;
}

function requireHash(value: string, code: string): string {
  if (!HASH_PATTERN.test(value)) throw new ChapterMasterError(code);
  return value;
}

function requireInteger(
  value: number,
  minimum: number,
  maximum: number,
  code: string,
): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new ChapterMasterError(code);
  }
  return value;
}

function requireRights(
  rights: ArtifactRightsSnapshot,
  plan: ChapterAssemblyPlan,
  now: Date,
): void {
  requireIdentifier(rights.rightsEvidenceId, "CHAPTER_MASTER_RIGHTS_ID_INVALID");
  requireHash(rights.rightsFingerprint, "CHAPTER_MASTER_RIGHTS_HASH_INVALID");
  if (!rights.allowedUses.includes("audiobook")) {
    throw new ChapterMasterError("CHAPTER_MASTER_AUDIOBOOK_RIGHTS_REQUIRED");
  }
  if (!rights.commercialUseApproved) {
    throw new ChapterMasterError("CHAPTER_MASTER_COMMERCIAL_RIGHTS_REQUIRED");
  }
  if (rights.expiresAt && Date.parse(rights.expiresAt) <= now.getTime()) {
    throw new ChapterMasterError("CHAPTER_MASTER_RIGHTS_EXPIRED");
  }
  if (rights.deletionRequiredAt && Date.parse(rights.deletionRequiredAt) <= now.getTime()) {
    throw new ChapterMasterError("CHAPTER_MASTER_RETENTION_EXPIRED");
  }
  for (const segment of plan.segments) {
    if (segment.rightsFingerprint !== rights.rightsFingerprint) {
      throw new ChapterMasterError("CHAPTER_MASTER_RIGHTS_SCOPE_MISMATCH");
    }
  }
}

function assertRenderMatchesPlan(
  plan: ChapterAssemblyPlan,
  render: ChapterRenderResult,
): void {
  assertChapterAssemblyPlan(plan);
  assertChapterRenderEvidence(render.evidence);
  if (
    render.evidence.planId !== plan.id
    || render.evidence.planFingerprint !== plan.fingerprint
    || render.evidence.expectedDurationMs !== plan.renderedDurationMs
  ) {
    throw new ChapterMasterError("CHAPTER_MASTER_RENDER_PLAN_MISMATCH");
  }
  if (render.evidence.sources.length !== plan.segments.length) {
    throw new ChapterMasterError("CHAPTER_MASTER_RENDER_SOURCE_COUNT_MISMATCH");
  }
  for (const [index, segment] of plan.segments.entries()) {
    const source = render.evidence.sources[index];
    if (
      !source
      || source.artifactId !== segment.audio.id
      || source.artifactFingerprint !== segment.audio.fingerprint
      || source.contentHash !== segment.audio.contentHash
      || source.byteCount !== segment.audio.byteCount
    ) {
      throw new ChapterMasterError("CHAPTER_MASTER_RENDER_SOURCE_MISMATCH");
    }
  }
  if (!(render.bytes instanceof Uint8Array) || render.bytes.byteLength === 0) {
    throw new ChapterMasterError("CHAPTER_MASTER_BYTES_REQUIRED");
  }
  if (
    render.evidence.output.contentHash !== hashBytes(render.bytes)
    || render.evidence.output.byteCount !== render.bytes.byteLength
  ) {
    throw new ChapterMasterError("CHAPTER_MASTER_RENDER_OUTPUT_MISMATCH");
  }
  if (
    render.evidence.output.format !== plan.output.format
    || render.evidence.output.sampleRateHz !== plan.output.sampleRateHz
    || render.evidence.output.channels !== plan.output.channels
    || render.evidence.output.bitDepth !== plan.output.bitDepth
  ) {
    throw new ChapterMasterError("CHAPTER_MASTER_RENDER_PROFILE_MISMATCH");
  }
}

function chainFingerprint(
  value: Omit<ChapterMasterArtifactChain, "fingerprint">,
): string {
  return stableHash({
    schemaVersion: value.schemaVersion,
    planId: value.planId,
    planFingerprint: value.planFingerprint,
    assemblyManifest: {
      id: value.assemblyManifest.payload.id,
      revision: value.assemblyManifest.revision,
      fingerprint: value.assemblyManifest.payload.fingerprint,
    },
    renderEvidence: {
      id: value.renderEvidence.payload.id,
      revision: value.renderEvidence.revision,
      fingerprint: value.renderEvidence.payload.fingerprint,
    },
    chapterMaster: {
      id: value.chapterMaster.payload.id,
      revision: value.chapterMaster.revision,
      fingerprint: value.chapterMaster.payload.fingerprint,
    },
    postRenderEngineering: {
      id: value.postRenderEngineering.ingest.envelope.payload.id,
      revision: value.postRenderEngineering.ingest.envelope.revision,
      fingerprint: value.postRenderEngineering.evidence.fingerprint,
    },
    expectedDurationMs: value.expectedDurationMs,
    observedDurationMs: value.observedDurationMs,
    durationDriftMs: value.durationDriftMs,
    eligibleForReview: value.eligibleForReview,
    findingCodes: [...value.findingCodes],
  });
}

function jsonBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(value)}\n`);
}

function stableArtifactId(kind: string, value: unknown): string {
  return `artifact_${kind}_${stableHash(value).slice(0, 24)}`;
}

async function ingestEvidenceArtifact(
  objectStore: FilePrivateObjectStore,
  registry: FileArtifactRegistry,
  input: Readonly<{
    id: string;
    projectId: string;
    jobId: string;
    segmentId: string;
    takeId: string;
    bytes: Uint8Array;
    sourceContentHash: string;
    generationRequestHash: string;
    parentArtifactIds: readonly string[];
    rights: ArtifactRightsSnapshot;
    actorId: string;
    verifierActorId: string;
    now: Date;
    schemaCheck: string;
  }>,
): Promise<ArtifactIngestResult> {
  return await ingestPrivateArtifact(objectStore, registry, {
    id: input.id,
    kind: "audio-analysis",
    projectId: input.projectId,
    jobId: input.jobId,
    segmentId: input.segmentId,
    takeId: input.takeId,
    bytes: input.bytes,
    claimedMimeType: "application/json",
    claimedFormat: "json",
    provenance: {
      createdByActorId: input.actorId,
      sourceContentHash: input.sourceContentHash,
      generationRequestHash: input.generationRequestHash,
      parentArtifactIds: input.parentArtifactIds,
    },
    rights: input.rights,
    reviewRequired: false,
    actorId: input.actorId,
    verifierActorId: input.verifierActorId,
    verificationChecks: ["json-parse", input.schemaCheck],
    now: input.now,
  });
}

function postRenderFindings(
  plan: ChapterAssemblyPlan,
  engineering: AudioEngineeringArtifactResult,
  maximumDurationDriftMs: number,
): Readonly<{
  durationDriftMs: number;
  findings: readonly Finding[];
}> {
  const observedDurationMs = Math.round(engineering.evidence.probe.durationSeconds * 1_000);
  const durationDriftMs = Math.abs(observedDurationMs - plan.renderedDurationMs);
  const findings: Finding[] = [];
  if (durationDriftMs > maximumDurationDriftMs) {
    findings.push({
      code: "CHAPTER_MASTER_DURATION_DRIFT",
      severity: "error",
      message: `Rendered chapter duration differs from the approved assembly by ${durationDriftMs} ms.`,
    });
  }
  if (engineering.evidence.metrics.sampleRateHz !== plan.output.sampleRateHz) {
    findings.push({
      code: "CHAPTER_MASTER_SAMPLE_RATE_DRIFT",
      severity: "error",
      message: "Rendered chapter sample rate differs from the approved assembly output profile.",
    });
  }
  if (engineering.evidence.metrics.channels !== plan.output.channels) {
    findings.push({
      code: "CHAPTER_MASTER_CHANNEL_DRIFT",
      severity: "error",
      message: "Rendered chapter channel count differs from the approved assembly output profile.",
    });
  }
  return Object.freeze({ durationDriftMs, findings: Object.freeze(findings) });
}

export async function ingestChapterMaster(
  objectStore: FilePrivateObjectStore,
  registry: FileArtifactRegistry,
  input: IngestChapterMasterInput,
): Promise<ChapterMasterArtifactChain> {
  const now = input.now ?? new Date();
  if (Number.isNaN(now.getTime())) throw new ChapterMasterError("CHAPTER_MASTER_DATE_INVALID");
  requireIdentifier(input.actorId, "CHAPTER_MASTER_ACTOR_ID_INVALID");
  const verifierActorId = input.verifierActorId ?? input.actorId;
  requireIdentifier(verifierActorId, "CHAPTER_MASTER_VERIFIER_ID_INVALID");
  const maximumDurationDriftMs = input.maximumDurationDriftMs ?? DEFAULT_DURATION_DRIFT_MS;
  requireInteger(
    maximumDurationDriftMs,
    0,
    MAXIMUM_DURATION_DRIFT_MS,
    "CHAPTER_MASTER_DURATION_TOLERANCE_INVALID",
  );
  if (input.signal?.aborted) throw new ChapterMasterError("CHAPTER_MASTER_ABORTED");
  assertRenderMatchesPlan(input.plan, input.render);
  requireRights(input.rights, input.plan, now);

  const scopeHash = stableHash({
    plan: input.plan.fingerprint,
    render: input.render.evidence.fingerprint,
  });
  const jobId = `job_master_${scopeHash.slice(0, 24)}`;
  const takeId = `take_master_${scopeHash.slice(0, 24)}`;
  const segmentId = input.plan.chapterId;

  const assemblyBytes = jsonBytes(input.plan);
  const assembly = await ingestEvidenceArtifact(objectStore, registry, {
    id: stableArtifactId("assembly", {
      planId: input.plan.id,
      fingerprint: input.plan.fingerprint,
    }),
    projectId: input.plan.projectId,
    jobId,
    segmentId,
    takeId,
    bytes: assemblyBytes,
    sourceContentHash: input.plan.manuscriptSourceHash,
    generationRequestHash: input.plan.fingerprint,
    parentArtifactIds: [],
    rights: input.rights,
    actorId: input.actorId,
    verifierActorId,
    now,
    schemaCheck: "chapter-assembly-schema",
  });
  if (!assembly.accepted) throw new ChapterMasterError("CHAPTER_MASTER_ASSEMBLY_ARTIFACT_INVALID");

  const renderBytes = jsonBytes(input.render.evidence);
  const renderEvidence = await ingestEvidenceArtifact(objectStore, registry, {
    id: stableArtifactId("render", {
      planId: input.plan.id,
      fingerprint: input.render.evidence.fingerprint,
    }),
    projectId: input.plan.projectId,
    jobId,
    segmentId,
    takeId,
    bytes: renderBytes,
    sourceContentHash: input.render.evidence.output.contentHash,
    generationRequestHash: input.render.evidence.commandFingerprint,
    parentArtifactIds: [assembly.envelope.payload.id],
    rights: input.rights,
    actorId: input.actorId,
    verifierActorId,
    now,
    schemaCheck: "chapter-render-evidence-schema",
  });
  if (!renderEvidence.accepted) throw new ChapterMasterError("CHAPTER_MASTER_RENDER_ARTIFACT_INVALID");

  const master = await ingestPrivateArtifact(objectStore, registry, {
    id: stableArtifactId("master", {
      planId: input.plan.id,
      renderFingerprint: input.render.evidence.fingerprint,
      contentHash: input.render.evidence.output.contentHash,
    }),
    kind: "chapter-master",
    projectId: input.plan.projectId,
    jobId,
    segmentId,
    takeId,
    bytes: input.render.bytes,
    claimedMimeType: "audio/wav",
    claimedFormat: "wav",
    provenance: {
      createdByActorId: input.actorId,
      sourceContentHash: input.plan.manuscriptSourceHash,
      generationRequestHash: input.render.evidence.commandFingerprint,
      parentArtifactIds: [renderEvidence.envelope.payload.id],
    },
    rights: input.rights,
    reviewRequired: true,
    actorId: input.actorId,
    verifierActorId,
    verificationChecks: [
      "chapter-render-output-hash",
      "chapter-render-output-size",
      "chapter-render-output-signature",
    ],
    now,
  });
  if (!master.accepted && master.envelope.payload.verification.status !== "quarantined") {
    throw new ChapterMasterError("CHAPTER_MASTER_ARTIFACT_INVALID");
  }

  const engineering = await ingestAudioEngineeringArtifact(
    objectStore,
    registry,
    {
      candidateArtifactId: master.envelope.payload.id,
      projectId: input.plan.projectId,
      jobId,
      segmentId,
      takeId,
      generationRequestHash: input.render.evidence.commandFingerprint,
      bytes: input.render.bytes,
      format: "wav",
      rights: input.rights,
      actorId: input.actorId,
      verifierActorId,
      profile: input.engineering.profile.profile,
      profileVersion: input.engineering.profile.externalVersion,
      profileReviewedAt: input.engineering.profile.reviewedAt,
      profileSourceReference: input.engineering.profile.sourceReference,
      ...(input.engineering.runner ? { runner: input.engineering.runner } : {}),
      ...(input.engineering.ffprobePath ? { ffprobePath: input.engineering.ffprobePath } : {}),
      ...(input.engineering.ffmpegPath ? { ffmpegPath: input.engineering.ffmpegPath } : {}),
      ...(input.engineering.timeoutMs !== undefined
        ? { timeoutMs: input.engineering.timeoutMs }
        : {}),
      ...(input.engineering.maximumOutputBytes !== undefined
        ? { maximumOutputBytes: input.engineering.maximumOutputBytes }
        : {}),
      ...(input.engineering.temporaryRoot
        ? { temporaryRoot: input.engineering.temporaryRoot }
        : {}),
      now,
      ...(input.signal ? { signal: input.signal } : {}),
    },
  );

  const comparison = postRenderFindings(input.plan, engineering, maximumDurationDriftMs);
  const engineeringCodes = engineering.evidence.findings
    .filter((finding) => finding.severity === "error")
    .map((finding) => finding.code);
  const comparisonCodes = comparison.findings.map((finding) => finding.code);
  const findingCodes = Object.freeze([
    ...new Set([...engineeringCodes, ...comparisonCodes]),
  ].sort((left, right) => left.localeCompare(right, "en-AU")));
  let masterEnvelope = master.envelope;
  const eligibleForReview = engineering.candidateEligible && comparison.findings.length === 0;
  if (!eligibleForReview && masterEnvelope.payload.verification.status === "verified") {
    const quarantined = quarantineArtifact(masterEnvelope.payload, {
      code: "CHAPTER_MASTER_ENGINEERING_INELIGIBLE",
      message: "The rendered chapter master failed independent post-render engineering or duration validation.",
      actorId: verifierActorId,
      findings: [
        ...engineering.evidence.findings,
        ...comparison.findings,
      ],
      quarantinedAt: now,
    });
    masterEnvelope = await registry.save(quarantined, {
      expectedRevision: masterEnvelope.revision,
      actorId: verifierActorId,
      action: "artifact.chapter_master_quarantined",
    });
  }

  const partial: Omit<ChapterMasterArtifactChain, "fingerprint"> = {
    schemaVersion: CHAPTER_MASTER_SCHEMA_VERSION,
    planId: input.plan.id,
    planFingerprint: input.plan.fingerprint,
    assemblyManifest: assembly.envelope,
    renderEvidence: renderEvidence.envelope,
    chapterMaster: masterEnvelope,
    postRenderEngineering: engineering,
    expectedDurationMs: input.plan.renderedDurationMs,
    observedDurationMs: Math.round(engineering.evidence.probe.durationSeconds * 1_000),
    durationDriftMs: comparison.durationDriftMs,
    eligibleForReview,
    findingCodes,
  };
  return Object.freeze({
    ...partial,
    fingerprint: chainFingerprint(partial),
  });
}

export function chapterMasterPublicView(
  chain: ChapterMasterArtifactChain,
): ChapterMasterPublicView {
  if (chain.schemaVersion !== CHAPTER_MASTER_SCHEMA_VERSION) {
    throw new ChapterMasterError("CHAPTER_MASTER_SCHEMA_UNSUPPORTED");
  }
  requireHash(chain.planFingerprint, "CHAPTER_MASTER_PLAN_HASH_INVALID");
  requireHash(chain.fingerprint, "CHAPTER_MASTER_CHAIN_HASH_INVALID");
  if (chainFingerprint({
    schemaVersion: chain.schemaVersion,
    planId: chain.planId,
    planFingerprint: chain.planFingerprint,
    assemblyManifest: chain.assemblyManifest,
    renderEvidence: chain.renderEvidence,
    chapterMaster: chain.chapterMaster,
    postRenderEngineering: chain.postRenderEngineering,
    expectedDurationMs: chain.expectedDurationMs,
    observedDurationMs: chain.observedDurationMs,
    durationDriftMs: chain.durationDriftMs,
    eligibleForReview: chain.eligibleForReview,
    findingCodes: chain.findingCodes,
  }) !== chain.fingerprint) {
    throw new ChapterMasterError("CHAPTER_MASTER_CHAIN_FINGERPRINT_MISMATCH");
  }
  const evidence = chain.postRenderEngineering.evidence;
  requireInteger(chain.expectedDurationMs, 1, Number.MAX_SAFE_INTEGER, "CHAPTER_MASTER_EXPECTED_DURATION_INVALID");
  requireInteger(chain.observedDurationMs, 1, Number.MAX_SAFE_INTEGER, "CHAPTER_MASTER_OBSERVED_DURATION_INVALID");
  requireInteger(chain.durationDriftMs, 0, Number.MAX_SAFE_INTEGER, "CHAPTER_MASTER_DURATION_DRIFT_INVALID");
  const master = chain.chapterMaster.payload;
  return Object.freeze({
    planId: chain.planId,
    planFingerprint: chain.planFingerprint,
    chapterId: master.segmentId ?? "chapter-unresolved",
    masterArtifactId: master.id,
    masterRevision: chain.chapterMaster.revision,
    verificationStatus: master.verification.status,
    reviewStatus: master.review.status,
    engineeringProfileId: evidence.profile.profile.id,
    engineeringProfileVersion: evidence.profile.externalVersion,
    observedDurationMs: chain.observedDurationMs,
    expectedDurationMs: chain.expectedDurationMs,
    durationDriftMs: chain.durationDriftMs,
    eligibleForReview: chain.eligibleForReview,
    findingCodes: chain.findingCodes,
    fingerprint: chain.fingerprint,
  });
}
