import { ProviderAdapterRegistry } from "@evavo/storyteller-engine/provider-adapter";

/**
 * Built-in production adapters are registered here only after their request,
 * rights, privacy, cost and response-validation contracts have passed review.
 */
export function createWorkerProviderRegistry(): ProviderAdapterRegistry {
  return new ProviderAdapterRegistry();
}
