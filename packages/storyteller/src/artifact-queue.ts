import {
  assessQueueCompletionArtifacts,
  type ArtifactGateAssessment,
  type ArtifactRecord,
} from "./artifact-registry.js";
import {
  type FileGenerationQueue,
  type GenerationQueueClaim,
} from "./generation-queue.js";
import { stableHash, type ProjectUse } from "./index.js";
import type { StoredEnvelope } from "./project-store.js";
import type { GenerationQueueItem } from "./generation-queue-contracts.js";

export interface ArtifactBackedCompletionResult {
  envelope: StoredEnvelope<GenerationQueueItem>;
  artifactIds: readonly string[];
  candidateTakeIds: readonly string[];
  admissionFingerprint: string;
}

export class ArtifactAdmissionError extends Error {
  readonly assessment: ArtifactGateAssessment;

  constructor(assessment: ArtifactGateAssessment) {
    const codes = assessment.findings
      .filter((finding) => finding.severity === "error")
      .map((finding) => finding.code);
    super(`ARTIFACT_ADMISSION_BLOCKED:${codes.join(",") || "UNKNOWN"}`);
    this.name = "ArtifactAdmissionError";
    this.assessment = assessment;
  }
}

const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const CURRENCY_PATTERN = /^[A-Z]{3}$/u;

function validateCompletionAccounting(
  totalEstimatedCost: number | undefined,
  currency: string | undefined,
): void {
  if ((totalEstimatedCost === undefined) !== (currency === undefined)) {
    throw new Error("ARTIFACT_COMPLETION_COST_CURRENCY_PAIR_REQUIRED");
  }
  if (
    totalEstimatedCost !== undefined
    && (!Number.isFinite(totalEstimatedCost) || totalEstimatedCost < 0)
  ) {
    throw new Error("ARTIFACT_COMPLETION_COST_INVALID");
  }
  if (currency !== undefined && !CURRENCY_PATTERN.test(currency)) {
    throw new Error("ARTIFACT_COMPLETION_CURRENCY_INVALID");
  }
}

export function artifactAdmissionFingerprint(
  claim: Pick<GenerationQueueClaim, "item">,
  assessment: ArtifactGateAssessment,
  candidateTakeIds: readonly string[],
): string {
  return stableHash({
    schemaVersion: "storyteller-artifact-admission-v1",
    queueItemId: claim.item.id,
    jobId: claim.item.jobId,
    jobIdempotencyKey: claim.item.idempotencyKey,
    artifactIds: assessment.artifactIds,
    candidateTakeIds,
  });
}

export async function completeGenerationWithArtifacts(input: Readonly<{
  queue: FileGenerationQueue;
  claim: GenerationQueueClaim;
  artifacts: readonly ArtifactRecord[];
  executionReportHash: string;
  intendedUse?: ProjectUse;
  commercial?: boolean;
  totalEstimatedCost?: number;
  currency?: string;
  beforeQueueComplete?: (input: Readonly<{
    artifactIds: readonly string[];
    candidateTakeIds: readonly string[];
    admissionFingerprint: string;
  }>) => Promise<void>;
  now?: Date;
}>): Promise<ArtifactBackedCompletionResult> {
  if (!HASH_PATTERN.test(input.executionReportHash)) {
    throw new Error("ARTIFACT_COMPLETION_REPORT_HASH_INVALID");
  }
  validateCompletionAccounting(input.totalEstimatedCost, input.currency);

  if (
    input.claim.item.status !== "leased"
    || input.claim.item.jobId !== input.claim.item.job.id
    || input.claim.item.projectId !== input.claim.item.job.projectId
    || input.claim.item.segmentId !== input.claim.item.job.segmentId
  ) {
    throw new Error("ARTIFACT_COMPLETION_CLAIM_INVALID");
  }

  const now = input.now ?? new Date();
  const assessment = assessQueueCompletionArtifacts(input.claim.item.job, input.artifacts, {
    ...(input.intendedUse ? { intendedUse: input.intendedUse } : {}),
    ...(input.commercial !== undefined ? { commercial: input.commercial } : {}),
    now,
  });
  if (!assessment.ok) throw new ArtifactAdmissionError(assessment);

  const candidateTakeIds = Object.freeze(
    input.artifacts
      .filter((artifact) => artifact.kind === "audio-candidate")
      .map((artifact) => artifact.takeId)
      .filter((takeId): takeId is string => Boolean(takeId))
      .sort((left, right) => left.localeCompare(right, "en-AU")),
  );
  if (candidateTakeIds.length !== input.claim.item.job.candidateCount) {
    throw new Error("ARTIFACT_COMPLETION_TAKE_COUNT_INVALID");
  }

  const admissionFingerprint = artifactAdmissionFingerprint(
    input.claim,
    assessment,
    candidateTakeIds,
  );
  await input.beforeQueueComplete?.({
    artifactIds: assessment.artifactIds,
    candidateTakeIds,
    admissionFingerprint,
  });
  const envelope = await input.queue.complete(
    input.claim.item.id,
    input.claim.leaseToken,
    {
      executionReportHash: input.executionReportHash,
      resultIds: candidateTakeIds,
      outputArtifactRefs: assessment.artifactIds,
      ...(input.totalEstimatedCost !== undefined
        ? {
            totalEstimatedCost: input.totalEstimatedCost,
            currency: input.currency,
          }
        : {}),
      now,
    },
  );

  return {
    envelope,
    artifactIds: assessment.artifactIds,
    candidateTakeIds,
    admissionFingerprint,
  };
}

export function artifactBackedCompletionPublicView(
  result: ArtifactBackedCompletionResult,
): Readonly<{
  queueItemId: string;
  jobId: string;
  status: "completed";
  artifactCount: number;
  candidateCount: number;
  admissionFingerprint: string;
  revision: number;
  completedAt: string;
}> {
  const completion = result.envelope.payload.completion;
  if (result.envelope.payload.status !== "completed" || !completion) {
    throw new Error("ARTIFACT_COMPLETION_RESULT_INVALID");
  }
  return Object.freeze({
    queueItemId: result.envelope.payload.id,
    jobId: result.envelope.payload.jobId,
    status: "completed",
    artifactCount: result.artifactIds.length,
    candidateCount: result.candidateTakeIds.length,
    admissionFingerprint: result.admissionFingerprint,
    revision: result.envelope.revision,
    completedAt: completion.completedAt,
  });
}
