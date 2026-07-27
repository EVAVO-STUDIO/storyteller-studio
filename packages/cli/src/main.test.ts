import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createProjectManifest,
  type CreateProjectInput,
} from "@evavo/storyteller-engine";
import { parseArguments, run } from "./main.js";

function manifest() {
  const input: CreateProjectInput = {
    id: "project_cli_queue_001",
    title: "The Bell",
    manuscriptText: "Chapter One\n\nThe bell rang once beneath the lake, and nobody in the village spoke.",
    rightsEvidence: {
      id: "rights_cli_queue_001",
      voiceLabel: "Designed narrator",
      sourceKind: "synthetic-designed",
      allowedUses: ["audiobook"],
      commercialUseApproved: true,
    },
    providerRequirements: {
      requiredFeatures: ["batch-long-form"],
      maximumSegmentCharacters: 1_200,
      prohibitInputStorage: true,
      prohibitTrainingUse: true,
    },
    providerProfiles: [
      {
        id: "provider_primary",
        label: "Primary provider",
        features: ["batch-long-form"],
        maximumInputCharacters: 10_000,
        regions: ["australia"],
        storesInputs: false,
        trainsOnCustomerData: false,
        customVoiceRequiresConsent: true,
      },
    ],
    createdAt: new Date("2026-07-27T00:00:00.000Z"),
  };
  const result = createProjectManifest(input);
  assert.equal(result.status, "planned");
  return result;
}

async function readJson(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
}

test("argument parsing preserves command positionals and explicit flags", () => {
  assert.deepEqual(
    parseArguments(["queue-list", "extra", "--data-dir", "./storage", "--force"]),
    {
      command: "queue-list",
      positionals: ["extra"],
      flags: { "data-dir": "./storage", force: true },
    },
  );
});

test("local queue CLI can enqueue, list, inspect and cancel without exposing lease hashes", async () => {
  const root = await mkdtemp(join(tmpdir(), "storyteller-cli-queue-"));
  try {
    const projectPath = join(root, "project.json");
    const enqueuePath = join(root, "enqueue.json");
    const listPath = join(root, "list.json");
    const showPath = join(root, "show.json");
    const cancelPath = join(root, "cancel.json");
    await writeFile(projectPath, `${JSON.stringify(manifest(), null, 2)}\n`, "utf8");

    const enqueueExit = await run(parseArguments([
      "queue-enqueue",
      "--project", projectPath,
      "--data-dir", root,
      "--priority", "75",
      "--max-attempts", "3",
      "--output", enqueuePath,
    ]));
    assert.equal(enqueueExit, 0);
    const enqueue = await readJson(enqueuePath);
    const queued = enqueue.data as Array<Record<string, unknown>>;
    assert.ok(queued.length > 0);
    const itemId = queued[0]!.id as string;
    assert.equal(queued[0]!.status, "queued");
    assert.equal(queued[0]!.priority, 75);
    assert.equal(JSON.stringify(enqueue).includes("tokenHash"), false);

    const listExit = await run(parseArguments([
      "queue-list",
      "--data-dir", root,
      "--project-id", "project_cli_queue_001",
      "--status", "queued,retry-wait",
      "--output", listPath,
    ]));
    assert.equal(listExit, 0);
    const listed = await readJson(listPath);
    assert.equal((listed.data as unknown[]).length, queued.length);

    const showExit = await run(parseArguments([
      "queue-show",
      "--data-dir", root,
      "--item-id", itemId,
      "--output", showPath,
    ]));
    assert.equal(showExit, 0);
    assert.equal(((await readJson(showPath)).data as Record<string, unknown>).status, "queued");

    const cancelExit = await run(parseArguments([
      "queue-cancel",
      "--data-dir", root,
      "--item-id", itemId,
      "--actor-id", "operator_cli_test",
      "--reason", "Direction review required before synthesis.",
      "--output", cancelPath,
    ]));
    assert.equal(cancelExit, 0);
    const cancelled = (await readJson(cancelPath)).data as Record<string, unknown>;
    assert.equal(cancelled.status, "cancelled");
    assert.equal(
      (cancelled.cancellation as Record<string, unknown>).actorId,
      "operator_cli_test",
    );
    assert.equal(JSON.stringify(cancelled).includes("tokenHash"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("queue commands require an explicit data root when the environment is unset", async () => {
  const previous = process.env.STORYTELLER_DATA_DIR;
  delete process.env.STORYTELLER_DATA_DIR;
  try {
    await assert.rejects(
      () => run(parseArguments(["queue-list"])),
      /CLI_FLAG_REQUIRED:data-dir/u,
    );
  } finally {
    if (previous === undefined) delete process.env.STORYTELLER_DATA_DIR;
    else process.env.STORYTELLER_DATA_DIR = previous;
  }
});
