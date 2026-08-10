import type { ProjectManifest } from "./index.js";
import type {
  FileGenerationQueue,
  GenerationQueueClaim,
} from "./generation-queue.js";
import type { StoredEnvelope } from "./project-store.js";
import type { GenerationQueueItem } from "./generation-queue-contracts.js";
import {
  assertPinnedProductionMaterial,
  createNarratorProductionJobs,
  narratorProductionBinding,
  type NarratorProductionJob,
} from "./narrator-production-job.js";
import {
  assertNarratorCasting,
  type NarratorCastingApproval,
} from "./narrator-voice-profile.js";

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
  casting: NarratorCastingApproval,
  material: NarratorProductionMaterialPin,
): asserts claim is GenerationQueueClaim & {
  item: GenerationQueueItem & { job: NarratorProductionJob };
} {
  assertNarratorCasting(casting);
  if (claim.item.projectId !== casting.projectId) {
    throw new Error("NARRATOR_PRODUCTION_CLAIM_PROJECT_MISMATCH");
  }
  const binding = narratorProductionBinding(claim.item.job);
  if (!binding) throw new Error("NARRATOR_PRODUCTION_CASTING_REQUIRED");
  if (binding.castingFingerprint !== casting.fingerprint) {
    throw new Error("NARRATOR_PRODUCTION_CASTING_MISMATCH");
  }
  assertPinnedProductionMaterial(claim.item.job, material);
}

export async function enqueueNarratorProduction(
  input: Readonly<{
    queue: FileGenerationQueue;
    manifest: ProjectManifest;
    casting: NarratorCastingApproval;
    candidateCount?: number;
    options?: NarratorProductionQueueAdmissionOptions;
  }>,
): Promise<readonly StoredEnvelope<GenerationQueueItem>[]> {
  assertNarratorCasting(input.casting);
  const jobs = createNarratorProductionJobs(
    input.manifest,
    input.casting,
    input.candidateCount ?? 3,
  );
  const envelopes: StoredEnvelope<GenerationQueueItem>[] = [];
  for (const job of jobs) {
    envelopes.push(await input.queue.enqueue(job, input.options ?? {}));
  }
  return Object.freeze(envelopes);
}
