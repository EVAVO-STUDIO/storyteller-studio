export type StorytellerHubActor = "owner" | "client";
export type StorytellerHubRole = "super-admin" | "workspace-owner" | "editor" | "viewer";

export type StorytellerHubManifest = Readonly<{
  id: "evavo-storyteller-studio";
  applicationKey: "storyteller-studio";
  title: "EVAVO Storyteller Studio";
  shortLabel: "ST";
  description: string;
  status: "active-development" | "private-preview" | "live";
  availability: "source-ready-launch-pending" | "owner-preview" | "client-ready";
  accent: "evavo-cherry";
  priority: number;
  capabilities: readonly string[];
  runtime: Readonly<{
    appKind: "protected-standalone-app";
    launchMode: "signed-launch-on-demand";
    sourceRepo: "EVAVO-STUDIO/storyteller-studio";
    healthHref: "/api/health";
    manifestHref: "/manifest.webmanifest";
    launchHref: null | "/api/hub/launch";
  }>;
  visibility: Readonly<{
    enabled: boolean;
    defaultVisible: false;
    acceptedActors: readonly StorytellerHubActor[];
    allowedRoles: readonly StorytellerHubRole[];
    requiresWorkspaceProvisioning: boolean;
    requiresAppEntitlement: boolean;
    clientRelease: boolean;
  }>;
  guardrails: readonly string[];
}>;

export const storytellerHubManifest: StorytellerHubManifest = Object.freeze({
  id: "evavo-storyteller-studio",
  applicationKey: "storyteller-studio",
  title: "EVAVO Storyteller Studio",
  shortLabel: "ST",
  description:
    "A private production workspace for directed long-form narration, series voice continuity, audiobook quality and art-directed visual story companions.",
  status: "active-development",
  availability: "source-ready-launch-pending",
  accent: "evavo-cherry",
  priority: 55,
  capabilities: Object.freeze([
    "Exact-source manuscript and performance planning",
    "Narrator, character and pronunciation continuity",
    "Rights-aware provider capability negotiation",
    "Candidate-take transcript and engineering QA",
    "Audiobook mastering and release gates",
    "Scene-level illustrated story planning",
    "Web, API and CLI production surfaces",
  ]),
  runtime: Object.freeze({
    appKind: "protected-standalone-app",
    launchMode: "signed-launch-on-demand",
    sourceRepo: "EVAVO-STUDIO/storyteller-studio",
    healthHref: "/api/health",
    manifestHref: "/manifest.webmanifest",
    launchHref: null,
  }),
  visibility: Object.freeze({
    enabled: true,
    defaultVisible: false,
    acceptedActors: Object.freeze(["owner", "client"] as const),
    allowedRoles: Object.freeze(["super-admin", "workspace-owner", "editor", "viewer"] as const),
    requiresWorkspaceProvisioning: true,
    requiresAppEntitlement: true,
    clientRelease: false,
  }),
  guardrails: Object.freeze([
    "The heavy audio, model and rendering runtime must never be bundled into the EVAVO marketing site.",
    "No owner or client launch is claimed until the signed launch receiver and isolated session boundary are verified.",
    "Voice identities require explicit rights and consent; named craft references are not cloning permission.",
    "Hub metadata contains no credentials, raw manuscript content, voice samples or execution controls.",
  ]),
});

export function shouldShowStorytellerHubCard(input: Readonly<{
  actor?: StorytellerHubActor;
  role?: StorytellerHubRole;
  workspaceProvisioned?: boolean;
  appEntitled?: boolean;
  manifest?: StorytellerHubManifest;
}>): boolean {
  const manifest = input.manifest ?? storytellerHubManifest;
  if (!manifest.visibility.enabled || !input.actor || !manifest.visibility.acceptedActors.includes(input.actor)) return false;
  if (!input.role || !manifest.visibility.allowedRoles.includes(input.role)) return false;
  if (manifest.visibility.requiresWorkspaceProvisioning && !input.workspaceProvisioned) return false;
  if (manifest.visibility.requiresAppEntitlement && !input.appEntitled) return false;
  if (input.actor === "client" && !manifest.visibility.clientRelease) return false;
  return input.actor === "owner" || manifest.visibility.defaultVisible;
}
