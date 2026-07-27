import { resolve } from "node:path";
import { FileCalibrationSessionStore } from "@evavo/storyteller-engine/calibration-store";
import { FileProjectStore } from "@evavo/storyteller-engine/project-store";

export type CalibrationEnvironment = Readonly<Record<string, string | undefined>>;
export type CalibrationStoreDriver = "disabled" | "file";

export type CalibrationStoreRuntimeConfiguration =
  | Readonly<{
      driver: "disabled";
      enabled: false;
      persistence: "none";
      mutationApiExposed: false;
      privateEvidenceApiExposed: false;
    }>
  | Readonly<{
      driver: "file";
      enabled: true;
      persistence: "single-host-file";
      mutationApiExposed: false;
      privateEvidenceApiExposed: false;
      rootDirectory: string;
      productionSingleHostAcknowledged: boolean;
    }>;

const DRIVER_PATTERN = /^(?:disabled|file)$/u;

function isProduction(environment: CalibrationEnvironment): boolean {
  return environment.NODE_ENV === "production" || environment.VERCEL_ENV === "production";
}

function enabled(value: string | undefined): boolean {
  return value?.trim().toLocaleLowerCase("en-AU") === "true";
}

export function resolveCalibrationStoreRuntimeConfiguration(
  environment: CalibrationEnvironment = process.env,
  workingDirectory = process.cwd(),
): CalibrationStoreRuntimeConfiguration {
  const rawDriver = environment.STORYTELLER_CALIBRATION_DRIVER
    ?.trim()
    .toLocaleLowerCase("en-AU") ?? "disabled";
  if (!DRIVER_PATTERN.test(rawDriver)) {
    throw new Error("CALIBRATION_STORE_DRIVER_INVALID");
  }
  if (rawDriver === "disabled") {
    return Object.freeze({
      driver: "disabled",
      enabled: false,
      persistence: "none",
      mutationApiExposed: false,
      privateEvidenceApiExposed: false,
    });
  }

  const dataDirectory = environment.STORYTELLER_DATA_DIR?.trim();
  if (!dataDirectory) throw new Error("CALIBRATION_STORE_DATA_DIR_REQUIRED");
  const productionSingleHostAcknowledged = enabled(
    environment.STORYTELLER_FILE_CALIBRATION_STORE_SINGLE_HOST,
  );
  if (isProduction(environment) && !productionSingleHostAcknowledged) {
    throw new Error("CALIBRATION_STORE_FILE_DRIVER_SINGLE_HOST_ACK_REQUIRED");
  }

  return Object.freeze({
    driver: "file",
    enabled: true,
    persistence: "single-host-file",
    mutationApiExposed: false,
    privateEvidenceApiExposed: false,
    rootDirectory: resolve(workingDirectory, dataDirectory, "calibration-sessions"),
    productionSingleHostAcknowledged,
  });
}

export function calibrationStoreRuntimeSummary(
  configuration: CalibrationStoreRuntimeConfiguration,
): Readonly<{
  driver: CalibrationStoreDriver;
  enabled: boolean;
  persistence: "none" | "single-host-file";
  mutationApiExposed: false;
  privateEvidenceApiExposed: false;
  productionSingleHostAcknowledged: boolean;
}> {
  return Object.freeze({
    driver: configuration.driver,
    enabled: configuration.enabled,
    persistence: configuration.persistence,
    mutationApiExposed: false,
    privateEvidenceApiExposed: false,
    productionSingleHostAcknowledged:
      configuration.driver === "file"
      && configuration.productionSingleHostAcknowledged,
  });
}

export function createCalibrationStoreRuntime(
  configuration: CalibrationStoreRuntimeConfiguration,
): FileCalibrationSessionStore | null {
  if (configuration.driver === "disabled") return null;
  return new FileCalibrationSessionStore(
    new FileProjectStore(configuration.rootDirectory),
  );
}
