import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  EnvironmentCredentialResolver,
  resolveWorkerRuntimeConfiguration,
  workerRuntimeConfigurationSummary,
} from "./configuration.js";
import { createWorkerProviderRegistry } from "./providers.js";
import { runConfiguredWorkerRuntime } from "./runtime.js";

function safeErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : "WORKER_PROCESS_FAILED";
  const match = message.match(/^[A-Z][A-Z0-9_]{2,95}/u);
  return match?.[0] ?? "WORKER_PROCESS_FAILED";
}

export async function startStorytellerWorker(): Promise<void> {
  const environment = process.env;
  const configuration = resolveWorkerRuntimeConfiguration(environment);
  const credentialBindings = configuration.enabled ? configuration.credentialBindings : {};
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
    event: "configuration",
    configuration: workerRuntimeConfigurationSummary(configuration),
    providerCount: providers.ids().length,
  }));

  const result = await runConfiguredWorkerRuntime(configuration, {
    providers,
    credentials,
  });
  console.info(JSON.stringify({
    service: "storyteller-studio-worker",
    event: "stopped",
    result,
  }));
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
