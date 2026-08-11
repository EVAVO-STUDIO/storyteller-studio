import {
  createAudiobookRetailDistributorAccountEvidence,
  type AudiobookRetailDistributorAccountEvidence,
} from "../src/audiobook-retail-release-decision.js";
import {
  createAdmittedNarratorRetailReleaseDecision,
  recordAdmittedNarratorRetailDeliveryTransfer,
  startAdmittedNarratorRetailDeliveryAttempt,
  type AdmittedNarratorRetailDeliveryAttempt,
  type AdmittedNarratorRetailReleaseDecision,
} from "../src/narrator-retail-release-delivery.js";
import {
  createTestAdmittedNarratorRetailPackageFixture,
  type TestAdmittedNarratorRetailPackageFixture,
} from "./narrator-retail-package.js";

export interface TestAdmittedNarratorRetailReleaseFixture {
  package: TestAdmittedNarratorRetailPackageFixture;
  distributorAccount: AudiobookRetailDistributorAccountEvidence;
  release: AdmittedNarratorRetailReleaseDecision;
}

export interface TestAdmittedNarratorRetailDeliveryFixture {
  releaseFixture: TestAdmittedNarratorRetailReleaseFixture;
  started: AdmittedNarratorRetailDeliveryAttempt;
  transferred: AdmittedNarratorRetailDeliveryAttempt;
}

export async function createTestAdmittedNarratorRetailReleaseFixture(
  input: Readonly<{
    mode?: "zero-shot" | "adapted";
    projectId?: string;
    bookId?: string;
  }> = {},
): Promise<TestAdmittedNarratorRetailReleaseFixture> {
  const packageFixture = await createTestAdmittedNarratorRetailPackageFixture(input);
  const distributorAccount = createAudiobookRetailDistributorAccountEvidence({
    id: `admitted_retail_account_${packageFixture.approval.bookId}`,
    projectId: packageFixture.approval.projectId,
    bookId: packageFixture.approval.bookId,
    accountReferenceHash: "a".repeat(64),
    verifiedByActorId: "admitted-retail-account-verifier",
    verifiedAt: "2026-08-10T11:37:00.000Z",
    expiresAt: "2026-08-31T11:37:00.000Z",
    now: new Date("2026-08-10T11:37:30.000Z"),
  });
  const release = createAdmittedNarratorRetailReleaseDecision({
    packageApproval: packageFixture.approval,
    distributorAccount,
    finalConfirmationId:
      `admitted_retail_release_confirmation_${packageFixture.approval.bookId}`,
    decidedByActorId: "admitted-retail-release-authority",
    humanConfirmation: true,
    validUntil: "2026-08-10T14:00:00.000Z",
    decidedAt: new Date("2026-08-10T12:00:00.000Z"),
  });
  return Object.freeze({
    package: packageFixture,
    distributorAccount,
    release,
  });
}

export async function createTestAdmittedNarratorRetailDeliveryFixture(
  input: Readonly<{
    mode?: "zero-shot" | "adapted";
    projectId?: string;
    bookId?: string;
  }> = {},
): Promise<TestAdmittedNarratorRetailDeliveryFixture> {
  const releaseFixture = await createTestAdmittedNarratorRetailReleaseFixture(input);
  const started = startAdmittedNarratorRetailDeliveryAttempt({
    release: releaseFixture.release,
    operatorId: "admitted-retail-delivery-operator",
    humanOperationConfirmed: true,
    startedAt: new Date("2026-08-10T12:01:00.000Z"),
  });
  const transferred = recordAdmittedNarratorRetailDeliveryTransfer(started, {
    receiptReferenceHash: "b".repeat(64),
    remoteDraftReferenceHash: "c".repeat(64),
    completedByActorId: "admitted-retail-delivery-operator",
    humanConfirmation: true,
    completedAt: new Date("2026-08-10T12:02:00.000Z"),
  });
  return Object.freeze({ releaseFixture, started, transferred });
}
