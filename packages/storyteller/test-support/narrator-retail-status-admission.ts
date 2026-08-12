import type { AudiobookRetailerNormalisedStatus } from "../src/audiobook-retailer-status-evidence.js";
import {
  createAdmittedNarratorRetailerStatusEvidence,
  type AdmittedNarratorRetailerStatusEvidence,
} from "../src/narrator-retail-status-admission.js";
import {
  createTestAdmittedNarratorRetailSubmissionAttemptFixture,
  type TestAdmittedNarratorRetailSubmissionAttemptFixture,
} from "./narrator-retail-submission.js";

export interface TestAdmittedNarratorRetailerStatusFixture {
  submission: TestAdmittedNarratorRetailSubmissionAttemptFixture;
  statusEvidence: AdmittedNarratorRetailerStatusEvidence;
}

export async function createTestAdmittedNarratorRetailerStatusFixture(
  input: Readonly<{
    mode?: "zero-shot" | "adapted";
    projectId?: string;
    bookId?: string;
    normalisedStatus?: AudiobookRetailerNormalisedStatus;
    issueCodes?: readonly string[];
  }> = {},
): Promise<TestAdmittedNarratorRetailerStatusFixture> {
  const submission =
    await createTestAdmittedNarratorRetailSubmissionAttemptFixture(input);
  const normalisedStatus = input.normalisedStatus ?? "processing";
  const defaultIssueCodes =
    normalisedStatus === "changes-requested"
      ? ["RETAILER_AUDIO_REVISION_REQUIRED"]
      : normalisedStatus === "rejected"
        ? ["RETAILER_TITLE_REJECTED"]
        : undefined;
  const issueCodes = input.issueCodes ?? defaultIssueCodes;
  const statusEvidence = createAdmittedNarratorRetailerStatusEvidence({
    submission: submission.submitted,
    normalisedStatus,
    externalStatusReferenceHash: "f".repeat(64),
    externalStatusTextHash: "a".repeat(64),
    ...(issueCodes ? { issueCodes } : {}),
    observedByActorId: "admitted-retailer-status-observer",
    humanObservationConfirmed: true,
    observedAt: new Date("2026-08-10T12:15:00.000Z"),
  });
  return Object.freeze({ submission, statusEvidence });
}
