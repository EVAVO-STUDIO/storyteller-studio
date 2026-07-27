import { resolve } from "node:path";
import {
  FileGenerationQueue,
  type GenerationQueueItem,
  type GenerationQueueStatus,
} from "@evavo/storyteller-engine/generation-queue";
import { FileProjectStore, type StoredEnvelope } from "@evavo/storyteller-engine/project-store";

export type GenerationQueueDriver = "disabled" | "file";

export type GenerationQueueRuntimeConfiguration =
  | Readonly<{
      driver: "disabled";
      enabled: false;
      persistence: "none";
      workerApiExposed: false;
    }>
  | Readonly<{
      driver: "file";
      enabled: true;
      persistence: "single-host-file";
      workerApiExposed: false;
      rootDirectory: string;
      productionSingleHostAcknowledged: boolean;
    }>;

export interface GenerationQueuePublicView {
  id: string;
  jobId: string;
  projectId: string;
  segmentId: string;
  status: GenerationQueueStatus;
  priority: number;
  attempt: number;
  maxAttempts: number;
  availableAt: string;
  createdAt: string;
  updatedAt: string;
  lease?: Readonly<{
    acquiredAt: string;
    heartbeatAt: string;
    expiresAt: string;
  }>;
  lastFailure?: Readonly<{
    code: string;
    message: string;
    retryable: boolean;
    occurredAt: string;
    providerId?: string;
  }>;
  completion?: Readonly<{
    executionReportHash: string;
    resultCount: number;
    outputArtifactCount: number;
    totalEstimatedCost?: number;
    currency?: string;
    completedAt: string;
  }>;
  cancellation?: Readonly<{
    actorId: string;
    reason: string;
    cancelledAt: string;
  }>;
  block?: Readonly<{
    codes: readonly string[];
    message: string;
    blockedAt: string;
  }>;
  revision: number;
  contentHash: string;
}

const QUEUE_DRIVER_PATTERN = /^(?:disabled|file)$/u;

function isProduction(environment: NodeJS.ProcessEnv): boolean {
  return environment.NODE_ENV === "production" || environment.VERCEL_ENV === "production";
}

function enabled(value: string | undefined): boolean {
  return value?.trim().toLocaleLowerCase("en-AU") === "true";
}

export function resolveGenerationQueueRuntimeConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
  workingDirectory = process.cwd(),
): GenerationQueueRuntimeConfiguration {
  const rawDriver = environment.STORYTELLER_QUEUE_DRIVER?.trim().toLocaleLowerCase("en-AU") ?? "disabled";
  if (!QUEUE_DRIVER_PATTERN.test(rawDriver)) throw new Error("GENERATION_QUEUE_DRIVER_INVALID");
  if (rawDriver === "disabled") {
    return Object.freeze({
      driver: "disabled",
      enabled: false,
      persistence: "none",
      workerApiExposed: false,
    });
  }

  const dataDirectory = environment.STORYTELLER_DATA_DIR?.trim();
  if (!dataDirectory) throw new Error("GENERATION_QUEUE_DATA_DIR_REQUIRED");
  const productionSingleHostAcknowledged = enabled(environment.STORYTELLER_FILE_QUEUE_SINGLE_HOST);
  if (isProduction(environment) && !productionSingleHostAcknowledged) {
    throw new Error("GENERATION_QUEUE_FILE_DRIVER_SINGLE_HOST_ACK_REQUIRED");
  }

  return Object.freeze({
    driver: "file",
    enabled: true,
    persistence: "single-host-file",
    workerApiExposed: false,
    rootDirectory: resolve(workingDirectory, dataDirectory, "generation-queue"),
    productionSingleHostAcknowledged,
  });
}

export function generationQueueRuntimeSummary(
  configuration: GenerationQueueRuntimeConfiguration,
): Readonly<{
  driver: GenerationQueueDriver;
  enabled: boolean;
  persistence: "none" | "single-host-file";
  workerApiExposed: false;
  productionSingleHostAcknowledged: boolean;
}> {
  return Object.freeze({
    driver: configuration.driver,
    enabled: configuration.enabled,
    persistence: configuration.persistence,
    workerApiExposed: false,
    productionSingleHostAcknowledged:
      configuration.driver === "file" && configuration.productionSingleHostAcknowledged,
  });
}

export function createGenerationQueueRuntime(
  configuration: GenerationQueueRuntimeConfiguration,
): FileGenerationQueue | null {
  if (configuration.driver === "disabled") return null;
  return new FileGenerationQueue(new FileProjectStore(configuration.rootDirectory));
}

export function generationQueuePublicView(
  envelope: StoredEnvelope<GenerationQueueItem>,
): GenerationQueuePublicView {
  const item = envelope.payload;
  return {
    id: item.id,
    jobId: item.jobId,
    projectId: item.projectId,
    segmentId: item.segmentId,
    status: item.status,
    priority: item.priority,
    attempt: item.attempt,
    maxAttempts: item.maxAttempts,
    availableAt: item.availableAt,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    ...(item.lease
      ? {
          lease: {
            acquiredAt: item.lease.acquiredAt,
            heartbeatAt: item.lease.heartbeatAt,
            expiresAt: item.lease.expiresAt,
          },
        }
      : {}),
    ...(item.lastFailure
      ? {
          lastFailure: {
            code: item.lastFailure.code,
            message: item.lastFailure.message,
            retryable: item.lastFailure.retryable,
            occurredAt: item.lastFailure.occurredAt,
            ...(item.lastFailure.providerId ? { providerId: item.lastFailure.providerId } : {}),
          },
        }
      : {}),
    ...(item.completion
      ? {
          completion: {
            executionReportHash: item.completion.executionReportHash,
            resultCount: item.completion.resultIds.length,
            outputArtifactCount: item.completion.outputArtifactRefs.length,
            ...(item.completion.totalEstimatedCost !== undefined
              ? {
                  totalEstimatedCost: item.completion.totalEstimatedCost,
                  currency: item.completion.currency,
                }
              : {}),
            completedAt: item.completion.completedAt,
          },
        }
      : {}),
    ...(item.cancellation
      ? {
          cancellation: {
            actorId: item.cancellation.actorId,
            reason: item.cancellation.reason,
            cancelledAt: item.cancellation.cancelledAt,
          },
        }
      : {}),
    ...(item.block
      ? {
          block: {
            codes: item.block.codes,
            message: item.block.message,
            blockedAt: item.block.blockedAt,
          },
        }
      : {}),
    revision: envelope.revision,
    contentHash: envelope.contentHash,
  };
}
