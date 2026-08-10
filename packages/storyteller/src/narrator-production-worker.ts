import {
  runClaimedGenerationWorker,
  type ClaimedGenerationWorkerInput,
  type GenerationWorkerResult,
} from "./generation-worker.js";
import {
  assertNarratorProductionClaim,
} from "./narrator-production-queue.js";
import type { AdmittedNarratorCasting } from "./narrator-casting-admission.js";

export interface NarratorProductionWorkerInput extends ClaimedGenerationWorkerInput {
  admittedCasting: AdmittedNarratorCasting;
}

export async function runNarratorProductionWorker(
  input: NarratorProductionWorkerInput,
): Promise<GenerationWorkerResult> {
  assertNarratorProductionClaim(
    input.claim,
    input.admittedCasting,
    input.material,
  );
  return runClaimedGenerationWorker(input);
}
