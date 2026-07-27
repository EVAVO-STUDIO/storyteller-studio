import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { parseArguments, run } from "./main.js";

async function readJson(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
}

async function createPricing(
  root: string,
  model: "eleven_v3" | "eleven_multilingual_v2",
  rate: number,
): Promise<Record<string, unknown>> {
  const path = join(root, `${model}-pricing.json`);
  const exit = await run(parseArguments([
    "elevenlabs-pricing",
    "--model", model,
    "--currency", "AUD",
    "--micros-per-thousand", String(rate),
    "--effective-from", "2026-07-01T00:00:00.000Z",
    "--expires-at", "2026-08-31T00:00:00.000Z",
    "--source-reference", `elevenlabs-${model}-cli-command-2026-07`,
    "--output", path,
  ]));
  assert.equal(exit, 0);
  return readJson(path);
}

test("CLI creates pricing snapshots and validates a complete redacted configuration", async () => {
  const root = await mkdtemp(join(tmpdir(), "storyteller-elevenlabs-cli-"));
  try {
    const v3Pricing = await createPricing(root, "eleven_v3", 240_000);
    const productionPricing = await createPricing(root, "eleven_multilingual_v2", 120_000);
    assert.match(v3Pricing.fingerprint as string, /^[a-f0-9]{64}$/u);
    assert.match(productionPricing.fingerprint as string, /^[a-f0-9]{64}$/u);

    const configurationPath = join(root, "elevenlabs.json");
    const summaryPath = join(root, "elevenlabs-summary.json");
    const configuration = {
      adapterVersion: "1.0.0",
      modelPolicies: [
        {
          mode: "preview",
          modelId: "eleven_v3",
          maximumInputCharacters: 3_000,
          pricing: v3Pricing,
        },
        {
          mode: "calibration",
          modelId: "eleven_v3",
          maximumInputCharacters: 3_000,
          pricing: v3Pricing,
        },
        {
          mode: "production",
          modelId: "eleven_multilingual_v2",
          maximumInputCharacters: 9_000,
          pricing: productionPricing,
        },
      ],
      voiceBindings: [{
        voiceProfileId: "voice_cli_command_narrator_001",
        voiceRevision: 4,
        voiceId: "premadeVoice0001",
        sourceKind: "premade",
        licenceEvidenceId: "licence_cli_command_premade_001",
        commercialUseApproved: true,
        allowedModes: ["preview", "calibration", "production"],
      }],
      pronunciationDictionaries: [{
        writtenForm: "Aelwyn",
        approvedRevision: 2,
        pronunciationDictionaryId: "dictionary_cli_command_001",
        versionId: "version_cli_command_002",
      }],
      dataPolicy: {
        retentionMode: "zero-retention-enterprise",
        storesInputs: false,
        trainsOnCustomerData: false,
        policyVersion: "elevenlabs-enterprise-zero-retention-2026-07",
      },
      outputBitrateKbps: 192,
      textNormalisation: "auto",
      maximumResponseBytes: 4 * 1024 * 1024,
      preflightTimeoutMs: 5_000,
      allowV3Production: false,
    };
    await writeFile(configurationPath, `${JSON.stringify(configuration, null, 2)}\n`, "utf8");

    const validateExit = await run(parseArguments([
      "elevenlabs-validate",
      "--input", configurationPath,
      "--validation-at", "2026-07-27T00:00:00.000Z",
      "--output", summaryPath,
    ]));
    assert.equal(validateExit, 0);
    const summary = await readJson(summaryPath);
    assert.equal(summary.providerId, "elevenlabs");
    assert.equal(summary.voiceBindingCount, 1);
    assert.equal(summary.pronunciationDictionaryCount, 1);
    assert.equal(summary.retentionMode, "zero-retention-enterprise");
    assert.match(summary.configurationFingerprint as string, /^[a-f0-9]{64}$/u);

    const serialised = JSON.stringify(summary);
    for (const forbidden of [
      "premadeVoice0001",
      "voice_cli_command_narrator_001",
      "licence_cli_command_premade_001",
      "dictionary_cli_command_001",
      "version_cli_command_002",
      "source-reference",
      "ELEVENLABS_API_KEY",
    ]) assert.equal(serialised.includes(forbidden), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("pricing command requires an integer micro-unit rate and protects existing output", async () => {
  const root = await mkdtemp(join(tmpdir(), "storyteller-elevenlabs-pricing-cli-"));
  try {
    const output = join(root, "pricing.json");
    const args = [
      "elevenlabs-pricing",
      "--model", "eleven_multilingual_v2",
      "--currency", "AUD",
      "--micros-per-thousand", "120000",
      "--effective-from", "2026-07-01T00:00:00.000Z",
      "--expires-at", "2026-08-31T00:00:00.000Z",
      "--source-reference", "elevenlabs-pricing-cli-overwrite-2026-07",
      "--output", output,
    ];
    assert.equal(await run(parseArguments(args)), 0);
    await assert.rejects(
      () => run(parseArguments(args)),
      /CLI_OUTPUT_EXISTS/u,
    );
    assert.equal(await run(parseArguments([...args, "--force"])), 0);

    await assert.rejects(
      () => run(parseArguments([
        "elevenlabs-pricing",
        "--model", "eleven_multilingual_v2",
        "--currency", "AUD",
        "--micros-per-thousand", "12.5",
        "--effective-from", "2026-07-01T00:00:00.000Z",
        "--expires-at", "2026-08-31T00:00:00.000Z",
        "--source-reference", "elevenlabs-pricing-cli-invalid-2026-07",
      ])),
      /CLI_FLAG_INTEGER_INVALID:micros-per-thousand/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("validation command rejects non-premade voice configuration offline", async () => {
  const root = await mkdtemp(join(tmpdir(), "storyteller-elevenlabs-validation-cli-"));
  try {
    const v3Pricing = await createPricing(root, "eleven_v3", 240_000);
    const productionPricing = await createPricing(root, "eleven_multilingual_v2", 120_000);
    const configurationPath = join(root, "invalid-elevenlabs.json");
    await writeFile(configurationPath, `${JSON.stringify({
      adapterVersion: "1.0.0",
      modelPolicies: [
        { mode: "preview", modelId: "eleven_v3", maximumInputCharacters: 3_000, pricing: v3Pricing },
        { mode: "calibration", modelId: "eleven_v3", maximumInputCharacters: 3_000, pricing: v3Pricing },
        { mode: "production", modelId: "eleven_multilingual_v2", maximumInputCharacters: 9_000, pricing: productionPricing },
      ],
      voiceBindings: [{
        voiceProfileId: "voice_cli_invalid_001",
        voiceRevision: 1,
        voiceId: "clonedVoice000001",
        sourceKind: "cloned",
        licenceEvidenceId: "licence_cli_invalid_001",
        commercialUseApproved: true,
        allowedModes: ["production"],
      }],
      dataPolicy: {
        retentionMode: "standard",
        storesInputs: true,
        trainsOnCustomerData: false,
        policyVersion: "elevenlabs-standard-2026-07",
      },
    }, null, 2)}\n`, "utf8");

    await assert.rejects(
      () => run(parseArguments([
        "elevenlabs-validate",
        "--input", configurationPath,
        "--validation-at", "2026-07-27T00:00:00.000Z",
      ])),
      /ELEVENLABS_NON_STOCK_VOICE_PROHIBITED/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
