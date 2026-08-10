import {
  runClaimedGenerationWorker,
  type ClaimedGenerationWorkerInput,
  type GenerationWorkerResult,
} from "./generation-worker.js";
import {
  assertNarratorProductionClaim,
} from "./narrator-production-queue.js";
import type { NarratorCastingApproval } from "./narrator-voice-profile.js";

export interface NarratorProductionWorkerInput extends ClaimedGenerationWorkerInput {
  casting: NarratorCastingApproval;
}

export async function runNarratorProductionWorker(
  input: NarratorProductionWorkerInput,
): Promise<GenerationWorkerResult> {
  assertNarratorProductionClaim(
    input.claim,
    input.casting,
    input.material,
  );
  return runClaimedGenerationWorker(input);
}
