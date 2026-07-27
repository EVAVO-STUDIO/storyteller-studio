import { ProviderAdapterRegistry } from "@evavo/storyteller-engine/provider-adapter";
import type { WorkerEnvironment } from "./configuration.js";
import { resolveElevenLabsWorkerProvider } from "./elevenlabs-provider.js";

export interface CreateWorkerProviderRegistryInput {
  workerEnabled: boolean;
  environment: WorkerEnvironment;
  credentialBindings: Readonly<Record<string, string>>;
  now?: () => Date;
  fetch?: typeof fetch;
}

/**
 * Built-in production adapters are registered only after their request,
 * rights, privacy, pricing, voice-source and response-validation contracts
 * have passed configuration validation. A missing or disabled provider
 * configuration produces an empty registry rather than a partial adapter.
 */
export function createWorkerProviderRegistry(
  input: CreateWorkerProviderRegistryInput,
): ProviderAdapterRegistry {
  const elevenLabs = resolveElevenLabsWorkerProvider({
    workerEnabled: input.workerEnabled,
    environment: input.environment,
    credentialBindings: input.credentialBindings,
    ...(input.now ? { now: input.now } : {}),
    ...(input.fetch ? { fetch: input.fetch } : {}),
  });
  return new ProviderAdapterRegistry(elevenLabs ? [elevenLabs.adapter] : []);
}
