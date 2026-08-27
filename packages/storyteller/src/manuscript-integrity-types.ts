export const MANUSCRIPT_INTEGRITY_SCHEMA_VERSION =
  "storyteller-manuscript-integrity-v1" as const;
export const MANUSCRIPT_INGEST_CHECKPOINT_SCHEMA_VERSION =
  "storyteller-manuscript-ingest-checkpoint-v1" as const;

export type ManuscriptIntegritySeverity = "info" | "warning" | "error";

export interface ManuscriptIntegrityFinding {
  code: string;
  severity: ManuscriptIntegritySeverity;
  message: string;
  chunkIndex?: number;
  segmentId?: string;
  sourceStart?: number;
  sourceEnd?: number;
}

export interface ManuscriptChunkDescriptor {
  index: number;
  codeUnitStart: number;
  codeUnitEnd: number;
  codeUnitLength: number;
  byteStart: number;
  byteEnd: number;
  byteLength: number;
  codePointCount: number;
  contentHash: string;
  chainHash: string;
}

export interface ManuscriptIntegrityManifest {
  schemaVersion: typeof MANUSCRIPT_INTEGRITY_SCHEMA_VERSION;
  sourceId?: string;
  sourceHash: string;
  sourceCodeUnitLength: number;
  sourceCodePointCount: number;
  sourceByteLength: number;
  targetChunkBytes: number;
  chunkCount: number;
  chunks: readonly ManuscriptChunkDescriptor[];
  rootChainHash: string;
  fingerprint: string;
}

export interface ManuscriptIntegrityVerification {
  ok: boolean;
  structureValid: boolean;
  sourceHashMatches: boolean;
  verifiedChunkCount: number;
  chunkCount: number;
  verifiedByteLength: number;
  findings: readonly ManuscriptIntegrityFinding[];
  fingerprint: string;
}

export interface ManuscriptIngestCheckpoint {
  schemaVersion: typeof MANUSCRIPT_INGEST_CHECKPOINT_SCHEMA_VERSION;
  sourceHash: string;
  manifestFingerprint: string;
  acceptedChunkHashes: readonly (string | null)[];
  acceptedChunkCount: number;
  acceptedByteLength: number;
  nextMissingChunkIndex: number | null;
  complete: boolean;
  revision: number;
  updatedAt: string;
  fingerprint: string;
}

export interface ManuscriptIntegritySegment {
  id: string;
  sourceStart: number;
  sourceEnd: number;
  text: string;
  sourceHash?: string;
  ordinal?: number;
}

export interface ManuscriptSegmentCoverageOptions {
  locale?: string;
  requireWhitespaceCoverage?: boolean;
  maxDetailedFindings?: number;
}

export interface ManuscriptSegmentCoverageReport {
  ok: boolean;
  sourceHash: string;
  segmentCount: number;
  validSegmentCount: number;
  sourceWordCount: number;
  coveredWordCount: number;
  missingWordCount: number;
  partialWordCount: number;
  wordCoverage: number;
  sourceNonWhitespaceCodeUnitCount: number;
  coveredNonWhitespaceCodeUnitCount: number;
  nonWhitespaceCoverage: number;
  exactSourceCoverage: boolean;
  whitespaceGapCount: number;
  finalWordCovered: boolean;
  segmentationMode: "intl-segmenter" | "unicode-regex-fallback";
  unicodeVersion: string;
  findings: readonly ManuscriptIntegrityFinding[];
  fingerprint: string;
}
