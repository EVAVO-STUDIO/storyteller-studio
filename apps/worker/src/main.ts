import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolveWorkerAudioEngineeringPolicy,
  workerAudioEngineeringPolicySummary,
} from "./audio-engineering.js";
import {
  EnvironmentCredentialResolver,
  resolveWorkerRuntimeConfiguration,
  workerRuntimeConfigurationSummary,
} from "./configuration.js";
import {
  publicationAlertRuntimeConfigurationSummary,
  resolvePublicationAlertRuntimeConfiguration,
} from "./publication-alert-configuration.js";
import { runConfiguredPublicationAlertRuntime } from "./publication-alert-runtime.js";
import {
  publicationRefreshRuntimeConfigurationSummary,
  resolvePublicationRefreshRuntimeConfiguration,
} from "./publication-refresh-configuration.js";
import { runConfiguredPublicationRefreshRuntime } from "./publication-refresh-runtime.js";
import { createWorkerProviderRegistry } from "./providers.js";
import { runConfiguredWorkerRuntime } from "./runtime.js";

type StorytellerWorkerProcessRole =
  | "generation"
  | "publication-alerts"
  | "publication-refresh";

function resolveProcessRole(
  value: string | undefined,
): StorytellerWorkerProcessRole {
  const role = value?.trim().toLocaleLowerCase("en-AU") ?? "generation";
  if (
    role !== "generation"
    && role !== "publication-alerts"
    && role !== "publication-refresh"
  ) {
    throw new Error("WORKER_PROCESS_ROLE_INVALID");
  }
  return role;
}

function safeErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : "WORKER_PROCESS_FAILED";
  const match = message.match(/^[A-Z][A-Z0-9_]{2,95}/u);
  return match?.[0] ?? "WORKER_PROCESS_FAILED";
}

async function startGenerationWorker(): Promise<void> {
  const environment = process.env;
  const configuration = resolveWorkerRuntimeConfiguration(environment);
  const credentialBindings = configuration.enabled ? configuration.credentialBindings : {};
  const audioEngineering = resolveWorkerAudioEngineeringPolicy({
    workerEnabled: configuration.enabled,
    environment,
    ...(configuration.enabled
      ? {
          temporaryRoot: resolve(
            configuration.objectRootDirectory,
            "..",
            "audio-engineering-temp",
          ),
        }
      : {}),
  });
  const providers = createWorkerProviderRegistry({
    workerEnabled: configuration.enabled,
    environment,
    credentialBindings,
  });
  const credentials = new EnvironmentCredentialResolver(
    environment,
    credentialBindings,
  );

  console.info(JSON.stringify({
    service: "storyteller-studio-worker",
    role: "generation",
    event: "configuration",
    configuration: workerRuntimeConfigurationSummary(configuration),
    audioEngineering: workerAudioEngineeringPolicySummary(audioEngineering),
    providerCount: providers.ids().length,
  }));

  const result = await runConfiguredWorkerRuntime(configuration, {
    providers,
    credentials,
    ...(audioEngineering ? { audioEngineering } : {}),
  });
  console.info(JSON.stringify({
    service: "storyteller-studio-worker",
    role: "generation",
    event: "stopped",
    result,
  }));
}

async function startPublicationAlertWorker(): Promise<void> {
  const environment = process.env;
  const configuration = resolvePublicationAlertRuntimeConfiguration(environment);
  console.info(JSON.stringify({
    service: "storyteller-studio-worker",
    role: "publication-alerts",
    event: "configuration",
    configuration: publicationAlertRuntimeConfigurationSummary(configuration),
  }));
  const result = await runConfiguredPublicationAlertRuntime(configuration, {
    environment,
  });
  console.info(JSON.stringify({
    service: "storyteller-studio-worker",
    role: "publication-alerts",
    event: "stopped",
    result,
  }));
}

async function startPublicationRefreshWorker(): Promise<void> {
  const environment = process.env;
  const configuration = resolvePublicationRefreshRuntimeConfiguration(environment);
  console.info(JSON.stringify({
    service: "storyteller-studio-worker",
    role: "publication-refresh",
    event: "configuration",
    configuration: publicationRefreshRuntimeConfigurationSummary(configuration),
  }));
  const result = await runConfiguredPublicationRefreshRuntime(configuration, {
    environment,
  });
  console.info(JSON.stringify({
    service: "storyteller-studio-worker",
    role: "publication-refresh",
    event: "stopped",
    result,
  }));
}

export async function startStorytellerWorker(): Promise<void> {
  const role = resolveProcessRole(process.env.STORYTELLER_WORKER_ROLE);
  if (role === "publication-alerts") {
    await startPublicationAlertWorker();
    return;
  }
  if (role === "publication-refresh") {
    await startPublicationRefreshWorker();
    return;
  }
  await startGenerationWorker();
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (entryPath === fileURLToPath(import.meta.url)) {
  startStorytellerWorker().catch((error: unknown) => {
    console.error(JSON.stringify({
      service: "storyteller-studio-worker",
      event: "failed",
      code: safeErrorCode(error),
    }));
    process.exitCode = 1;
  });
}
