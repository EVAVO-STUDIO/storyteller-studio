import { resolve } from "node:path";
import {
  FileAudiobookRetailPublicationEvidenceInboxStore,
  audiobookRetailPublicationEvidenceInboxPublicView,
  createAudiobookRetailPublicationEvidenceRequest,
  submitAudiobookRetailPublicationEvidence,
  type AudiobookRetailPublicationEvidenceInboxPublicView,
} from "@evavo/storyteller-engine/audiobook-retail-publication-evidence-inbox";
import { FileAudiobookRetailPublicationMonitorStore } from "@evavo/storyteller-engine/audiobook-retail-publication-monitor";
import type { AudiobookRetailPublicationVerification } from "@evavo/storyteller-engine/audiobook-retail-publication-verification";
import { FileProjectStore } from "@evavo/storyteller-engine/project-store";

export interface SubmitPublicationEvidenceCommandInput {
  dataDirectory: string;
  monitorId: string;
  verification: AudiobookRetailPublicationVerification;
  sourceReferenceHash: string;
  actorId: string;
  receivedAt?: Date;
}

export interface SubmitPublicationEvidenceCommandResult {
  data: AudiobookRetailPublicationEvidenceInboxPublicView;
  meta: Readonly<{
    idempotent: boolean;
    storeRevision: number;
    contentHash: string;
  }>;
}

function publicationState(dataDirectory: string): FileProjectStore {
  if (!dataDirectory.trim()) throw new Error("CLI_FLAG_REQUIRED:data-dir");
  return new FileProjectStore(resolve(dataDirectory, "publication-operations"));
}

export async function submitPublicationEvidenceCommand(
  input: SubmitPublicationEvidenceCommandInput,
): Promise<SubmitPublicationEvidenceCommandResult> {
  const receivedAt = input.receivedAt ?? new Date();
  if (Number.isNaN(receivedAt.getTime())) {
    throw new Error("CLI_PUBLICATION_EVIDENCE_RECEIVED_AT_INVALID");
  }

  const state = publicationState(input.dataDirectory);
  const monitors = new FileAudiobookRetailPublicationMonitorStore(state);
  const inbox = new FileAudiobookRetailPublicationEvidenceInboxStore(state);
  const monitor = (await monitors.require(input.monitorId)).payload;
  const request = createAudiobookRetailPublicationEvidenceRequest(
    monitor,
    receivedAt,
  );
  const item = submitAudiobookRetailPublicationEvidence({
    request,
    verification: input.verification,
    sourceReferenceHash: input.sourceReferenceHash,
    receivedByActorId: input.actorId,
    receivedAt,
  });
  const existing = await inbox.read(item.id);
  const envelope = await inbox.create(item, input.actorId);

  return Object.freeze({
    data: audiobookRetailPublicationEvidenceInboxPublicView(envelope.payload),
    meta: Object.freeze({
      idempotent: existing !== null,
      storeRevision: envelope.revision,
      contentHash: envelope.contentHash,
    }),
  });
}
