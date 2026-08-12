import {
  createAdmittedNarratorRetailPublicListingObservation,
  verifyAdmittedNarratorRetailPublication,
  type AdmittedNarratorRetailPublicationVerification,
  type AdmittedNarratorRetailPublicListingObservation,
} from "../src/narrator-retail-publication-admission.js";
import {
  createTestAdmittedNarratorRetailListingFixture,
  type TestAdmittedNarratorRetailListingFixture,
} from "./narrator-retail-listing-admission.js";

export interface TestAdmittedNarratorRetailPublicObservationFixture {
  listing: TestAdmittedNarratorRetailListingFixture;
  observation: AdmittedNarratorRetailPublicListingObservation;
}

export interface TestAdmittedNarratorRetailPublicationFixture {
  observationFixture: TestAdmittedNarratorRetailPublicObservationFixture;
  verification: AdmittedNarratorRetailPublicationVerification;
}

export type TestNarratorPublicRegionInput = Readonly<{
  regionCode: string;
  productPageAccessible: boolean;
  purchaseAvailable: boolean;
  sampleAvailable: boolean;
  samplePlaybackSuccessful: boolean;
}>;

export interface TestNarratorPublicObservationOverrides {
  displayTitle?: string;
  authorCredit?: string;
  narratorCredit?: string;
  publisherName?: string;
  languageTag?: string;
  description?: string;
  coverIdentityMatched?: boolean;
  ebookAsin?: string;
  ebookAssociationMatched?: boolean;
  regions?: readonly TestNarratorPublicRegionInput[];
  observedByActorId?: string;
  observedAt?: string;
  expiresAt?: string;
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

export async function createTestAdmittedNarratorRetailPublicObservationFixture(
  input: Readonly<{
    mode?: "zero-shot" | "adapted";
    projectId?: string;
    bookId?: string;
    observation?: TestNarratorPublicObservationOverrides;
  }> = {},
): Promise<TestAdmittedNarratorRetailPublicObservationFixture> {
  const listing = await createTestAdmittedNarratorRetailListingFixture(input);
  const identity = listing.approved.identity;
  const observedAt = input.observation?.observedAt
    ?? "2026-08-10T12:27:00.000Z";
  const observation = createAdmittedNarratorRetailPublicListingObservation({
    listing: listing.approved,
    id: `admitted_narrator_public_observation_${identity.bookId}`,
    audiobookAsin: "B0NARRAT01",
    publicProductReferenceHash: "1".repeat(64),
    sampleReferenceHash: "2".repeat(64),
    coverReferenceHash: "3".repeat(64),
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
    observedByActorId:
      input.observation?.observedByActorId
      ?? "admitted-narrator-public-observer",
    humanObservationConfirmed: true,
    observedAt,
    expiresAt:
      input.observation?.expiresAt ?? "2026-08-15T12:27:00.000Z",
    now: new Date(observedAt),
  });
  return Object.freeze({ listing, observation });
}

export async function createTestAdmittedNarratorRetailPublicationFixture(
  input: Readonly<{
    mode?: "zero-shot" | "adapted";
    projectId?: string;
    bookId?: string;
    observation?: TestNarratorPublicObservationOverrides;
    requiredRegions?: readonly string[];
    verifiedByActorId?: string;
    verifiedAt?: Date;
  }> = {},
): Promise<TestAdmittedNarratorRetailPublicationFixture> {
  const observationFixture =
    await createTestAdmittedNarratorRetailPublicObservationFixture(input);
  const verification = verifyAdmittedNarratorRetailPublication({
    observation: observationFixture.observation,
    id: `admitted_narrator_publication_${observationFixture.observation.bookId}`,
    requiredRegions: input.requiredRegions ?? ["AU", "US"],
    verifiedByActorId:
      input.verifiedByActorId ?? "admitted-narrator-publication-verifier",
    humanVerificationConfirmed: true,
    verifiedAt: input.verifiedAt ?? new Date("2026-08-10T12:28:00.000Z"),
  });
  return Object.freeze({ observationFixture, verification });
}
