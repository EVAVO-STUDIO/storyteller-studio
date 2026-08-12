import {
  createAdmittedNarratorRetailPublicationMonitor,
  type AdmittedNarratorRetailPublicationMonitor,
} from "../src/narrator-retail-publication-monitor-admission.js";
import {
  createAdmittedNarratorRetailPublicListingObservation,
  verifyAdmittedNarratorRetailPublication,
  type AdmittedNarratorRetailPublicationVerification,
} from "../src/narrator-retail-publication-admission.js";
import type {
  TestAdmittedNarratorRetailPublicationFixture,
  TestNarratorPublicObservationOverrides,
} from "./narrator-retail-publication-admission.js";
import {
  createTestAdmittedNarratorRetailPublicationFixture,
} from "./narrator-retail-publication-admission.js";

export interface TestAdmittedNarratorRetailPublicationMonitorFixture {
  publication: TestAdmittedNarratorRetailPublicationFixture;
  monitor: AdmittedNarratorRetailPublicationMonitor;
}

export interface CreateTestAdmittedNarratorRetailRefreshVerificationInput {
  publication: TestAdmittedNarratorRetailPublicationFixture;
  suffix: string;
  observedAt: string;
  verifiedAt: string;
  expiresAt?: string;
  observation?: Omit<
    TestNarratorPublicObservationOverrides,
    "observedAt" | "expiresAt" | "observedByActorId"
  >;
  audiobookAsin?: string;
}

const defaultRegions = Object.freeze([
  Object.freeze({
    regionCode: "AU",
    productPageAccessible: true,
    purchaseAvailable: true,
    sampleAvailable: true,
    samplePlaybackSuccessful: true,
  }),
  Object.freeze({
    regionCode: "US",
    productPageAccessible: true,
    purchaseAvailable: true,
    sampleAvailable: true,
    samplePlaybackSuccessful: true,
  }),
] as const);

export async function createTestAdmittedNarratorRetailPublicationMonitorFixture(
  input: Readonly<{
    mode?: "zero-shot" | "adapted";
    projectId?: string;
    bookId?: string;
    refreshIntervalHours?: number;
  }> = {},
): Promise<TestAdmittedNarratorRetailPublicationMonitorFixture> {
  const publication = await createTestAdmittedNarratorRetailPublicationFixture({
    mode: input.mode ?? "adapted",
    ...(input.projectId ? { projectId: input.projectId } : {}),
    ...(input.bookId ? { bookId: input.bookId } : {}),
  });
  const verification = publication.verification;
  const monitor = createAdmittedNarratorRetailPublicationMonitor({
    id: `admitted_narrator_publication_monitor_${verification.bookId}`,
    verification,
    refreshIntervalHours: input.refreshIntervalHours ?? 1,
    createdAt: new Date(verification.verifiedAt),
  });
  return Object.freeze({ publication, monitor });
}

export function createTestAdmittedNarratorRetailRefreshVerification(
  input: CreateTestAdmittedNarratorRetailRefreshVerificationInput,
): AdmittedNarratorRetailPublicationVerification {
  const listing = input.publication.observationFixture.listing.approved;
  const identity = listing.identity;
  const observation = createAdmittedNarratorRetailPublicListingObservation({
    listing,
    id: `admitted_narrator_monitor_observation_${input.suffix}`,
    audiobookAsin: input.audiobookAsin ?? "B0NARRAT01",
    publicProductReferenceHash: "4".repeat(64),
    sampleReferenceHash: "5".repeat(64),
    coverReferenceHash: "6".repeat(64),
    displayTitle:
      input.observation?.displayTitle ?? identity.metadata.displayTitle,
    authorCredit:
      input.observation?.authorCredit ?? identity.metadata.authorCredit,
    narratorCredit:
      input.observation?.narratorCredit ?? identity.metadata.narratorCredit,
    publisherName:
      input.observation?.publisherName ?? identity.metadata.publisherName,
    languageTag:
      input.observation?.languageTag ?? identity.metadata.languageTag,
    description:
      input.observation?.description ?? identity.metadata.description,
    coverIdentityMatched: input.observation?.coverIdentityMatched ?? true,
    ebookAsin: input.observation?.ebookAsin ?? identity.ebook.asin,
    ebookAssociationMatched:
      input.observation?.ebookAssociationMatched ?? true,
    regions: input.observation?.regions ?? defaultRegions,
    observedByActorId: `admitted-narrator-monitor-observer-${input.suffix}`,
    humanObservationConfirmed: true,
    observedAt: input.observedAt,
    expiresAt: input.expiresAt ?? "2026-08-15T13:30:00.000Z",
    now: new Date(input.observedAt),
  });
  return verifyAdmittedNarratorRetailPublication({
    observation,
    id: `admitted_narrator_monitor_verification_${input.suffix}`,
    requiredRegions: ["AU", "US"],
    verifiedByActorId: `admitted-narrator-monitor-verifier-${input.suffix}`,
    humanVerificationConfirmed: true,
    verifiedAt: new Date(input.verifiedAt),
  });
}
