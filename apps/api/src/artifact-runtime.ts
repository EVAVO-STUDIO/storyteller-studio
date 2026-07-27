import { resolve } from "node:path";
import { FileArtifactRegistry } from "@evavo/storyteller-engine/artifact-store";
import { FileProjectStore } from "@evavo/storyteller-engine/project-store";

export type ArtifactEnvironment = Readonly<Record<string, string | undefined>>;
export type ArtifactRegistryDriver = "disabled" | "file";

export type ArtifactRegistryRuntimeConfiguration =
  | Readonly<{
      driver: "disabled";
      enabled: false;
      persistence: "none";
      workerWriteApiExposed: false;
      releaseApiExposed: false;
    }>
  | Readonly<{
      driver: "file";
      enabled: true;
      persistence: "single-host-file";
      workerWriteApiExposed: false;
      releaseApiExposed: false;
      rootDirectory: string;
      productionSingleHostAcknowledged: boolean;
    }>;

const DRIVER_PATTERN = /^(?:disabled|file)$/u;

function isProduction(environment: ArtifactEnvironment): boolean {
  return environment.NODE_ENV === "production" || environment.VERCEL_ENV === "production";
}

function enabled(value: string | undefined): boolean {
  return value?.trim().toLocaleLowerCase("en-AU") === "true";
}

export function resolveArtifactRegistryRuntimeConfiguration(
  environment: ArtifactEnvironment = process.env,
  workingDirectory = process.cwd(),
): ArtifactRegistryRuntimeConfiguration {
  const rawDriver = environment.STORYTELLER_ARTIFACT_DRIVER?.trim().toLocaleLowerCase("en-AU") ?? "disabled";
  if (!DRIVER_PATTERN.test(rawDriver)) throw new Error("ARTIFACT_REGISTRY_DRIVER_INVALID");
  if (rawDriver === "disabled") {
    return Object.freeze({
      driver: "disabled",
      enabled: false,
      persistence: "none",
      workerWriteApiExposed: false,
      releaseApiExposed: false,
    });
  }

  const dataDirectory = environment.STORYTELLER_DATA_DIR?.trim();
  if (!dataDirectory) throw new Error("ARTIFACT_REGISTRY_DATA_DIR_REQUIRED");
  const productionSingleHostAcknowledged = enabled(
    environment.STORYTELLER_FILE_ARTIFACT_STORE_SINGLE_HOST,
  );
  if (isProduction(environment) && !productionSingleHostAcknowledged) {
    throw new Error("ARTIFACT_REGISTRY_FILE_DRIVER_SINGLE_HOST_ACK_REQUIRED");
  }

  return Object.freeze({
    driver: "file",
    enabled: true,
    persistence: "single-host-file",
    workerWriteApiExposed: false,
    releaseApiExposed: false,
    rootDirectory: resolve(workingDirectory, dataDirectory, "artifact-registry"),
    productionSingleHostAcknowledged,
  });
}

export function artifactRegistryRuntimeSummary(
  configuration: ArtifactRegistryRuntimeConfiguration,
): Readonly<{
  driver: ArtifactRegistryDriver;
  enabled: boolean;
  persistence: "none" | "single-host-file";
  workerWriteApiExposed: false;
  releaseApiExposed: false;
  productionSingleHostAcknowledged: boolean;
}> {
  return Object.freeze({
    driver: configuration.driver,
    enabled: configuration.enabled,
    persistence: configuration.persistence,
    workerWriteApiExposed: false,
    releaseApiExposed: false,
    productionSingleHostAcknowledged:
      configuration.driver === "file" && configuration.productionSingleHostAcknowledged,
  });
}

export function createArtifactRegistryRuntime(
  configuration: ArtifactRegistryRuntimeConfiguration,
): FileArtifactRegistry | null {
  if (configuration.driver === "disabled") return null;
  return new FileArtifactRegistry(new FileProjectStore(configuration.rootDirectory));
}
