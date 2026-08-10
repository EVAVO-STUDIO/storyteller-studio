import type { ProjectManifest } from "./index.js";
import type {
  FileGenerationQueue,
  GenerationQueueClaim,
} from "./generation-queue.js";
import type { StoredEnvelope } from "./project-store.js";
import type { GenerationQueueItem } from "./generation-queue-contracts.js";
import type { AdmittedNarratorCasting } from "./narrator-casting-admission.js";
import {
  assertNarratorProductionJob,
  assertPinnedProductionMaterial,
  createNarratorProductionJobs,
  type NarratorProductionJob,
} from "./narrator-production-job.js";

export interface NarratorProductionQueueAdmissionOptions {
  priority?: number;
  maxAttempts?: number;
  availableAt?: Date;
  now?: Date;
}

export interface NarratorProductionMaterialPin {
  mode?: string;
  voiceProfileId: string;
  voiceRevision: number;
  voiceProfileHash?: string;
}

export function assertNarratorProductionClaim(
  claim: GenerationQueueClaim,
  admittedCasting: AdmittedNarratorCasting,
  material: NarratorProductionMaterialPin,
): asserts claim is GenerationQueueClaim & {
  item: GenerationQueueItem & { job: NarratorProductionJob };
} {
  if (claim.item.projectId !== admittedCasting.projectId) {
    throw new Error("NARRATOR_PRODUCTION_CLAIM_PROJECT_MISMATCH");
  }
  assertNarratorProductionJob(claim.item.job, admittedCasting);
  assertPinnedProductionMaterial(claim.item.job, material);
}

export async function enqueueNarratorProduction(
  input: Readonly<{
    queue: FileGenerationQueue;
    manifest: ProjectManifest;
    admittedCasting: AdmittedNarratorCasting;
    candidateCount?: number;
    options?: NarratorProductionQueueAdmissionOptions;
  }>,
): Promise<readonly StoredEnvelope<GenerationQueueItem>[]> {
  const jobs = createNarratorProductionJobs(
    input.manifest,
    input.admittedCasting,
    input.candidateCount ?? 3,
  );
  const envelopes: StoredEnvelope<GenerationQueueItem>[] = [];
  for (const job of jobs) {
    envelopes.push(await input.queue.enqueue(job, input.options ?? {}));
  }
  return Object.freeze(envelopes);
}
