import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  calibrationStoreRuntimeSummary,
  createCalibrationStoreRuntime,
  resolveCalibrationStoreRuntimeConfiguration,
} from "./calibration-runtime.js";

test("calibration runtime is disabled unless a driver is explicitly configured", () => {
  const configuration = resolveCalibrationStoreRuntimeConfiguration({}, "C:\\work");
  assert.deepEqual(configuration, {
    driver: "disabled",
    enabled: false,
    persistence: "none",
    mutationApiExposed: false,
    privateEvidenceApiExposed: false,
  });
  assert.deepEqual(calibrationStoreRuntimeSummary(configuration), {
    driver: "disabled",
    enabled: false,
    persistence: "none",
    mutationApiExposed: false,
    privateEvidenceApiExposed: false,
    productionSingleHostAcknowledged: false,
  });
  assert.equal(createCalibrationStoreRuntime(configuration), null);
});

test("production file calibration reads require an explicit single-host acknowledgement", () => {
  assert.throws(
    () => resolveCalibrationStoreRuntimeConfiguration({
      NODE_ENV: "production",
      STORYTELLER_CALIBRATION_DRIVER: "file",
      STORYTELLER_DATA_DIR: "./storage",
    }),
    /CALIBRATION_STORE_FILE_DRIVER_SINGLE_HOST_ACK_REQUIRED/u,
  );

  const configuration = resolveCalibrationStoreRuntimeConfiguration({
    NODE_ENV: "production",
    STORYTELLER_CALIBRATION_DRIVER: "file",
    STORYTELLER_DATA_DIR: "./storage",
    STORYTELLER_FILE_CALIBRATION_STORE_SINGLE_HOST: "true",
  }, "/srv/storyteller");
  assert.equal(configuration.driver, "file");
  assert.equal(configuration.productionSingleHostAcknowledged, true);
  assert.equal(
    configuration.rootDirectory.endsWith(join("storage", "calibration-sessions")),
    true,
  );
  assert.deepEqual(calibrationStoreRuntimeSummary(configuration), {
    driver: "file",
    enabled: true,
    persistence: "single-host-file",
    mutationApiExposed: false,
    privateEvidenceApiExposed: false,
    productionSingleHostAcknowledged: true,
  });
});

test("calibration runtime rejects unknown drivers and missing data directories", () => {
  assert.throws(
    () => resolveCalibrationStoreRuntimeConfiguration({
      STORYTELLER_CALIBRATION_DRIVER: "database",
    }),
    /CALIBRATION_STORE_DRIVER_INVALID/u,
  );
  assert.throws(
    () => resolveCalibrationStoreRuntimeConfiguration({
      STORYTELLER_CALIBRATION_DRIVER: "file",
    }),
    /CALIBRATION_STORE_DATA_DIR_REQUIRED/u,
  );
});

test("file calibration runtime opens an isolated empty redacted store", async () => {
  const root = await mkdtemp(join(tmpdir(), "storyteller-api-calibration-runtime-"));
  try {
    const configuration = resolveCalibrationStoreRuntimeConfiguration({
      STORYTELLER_CALIBRATION_DRIVER: "file",
      STORYTELLER_DATA_DIR: ".",
    }, root);
    const store = createCalibrationStoreRuntime(configuration);
    if (!store) throw new Error("calibration store required");
    assert.deepEqual(await store.listPublic(), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
