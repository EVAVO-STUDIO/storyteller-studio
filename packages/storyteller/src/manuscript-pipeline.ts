import {
  segmentManuscript,
  stableHash,
  type SegmentedManuscript,
} from "./index.js";
import {
  auditManuscriptSegmentCoverage,
  createManuscriptIntegrityManifest,
  verifyManuscriptIntegrityManifest,
  type ManuscriptIntegrityManifest,
  type ManuscriptIntegrityVerification,
  type ManuscriptSegmentCoverageReport,
} from "./manuscript-integrity.js";

export interface IntegrityCheckedSegmentationOptions {
  projectId?: string;
  sourceId?: string;
  maximumCharacters?: number;
  targetChunkBytes?: number;
  locale?: string;
  maxDetailedFindings?: number;
}

export interface IntegrityCheckedSegmentation {
  manuscript: SegmentedManuscript;
  integrity: ManuscriptIntegrityManifest;
  verification: ManuscriptIntegrityVerification;
  coverage: ManuscriptSegmentCoverageReport;
  fingerprint: string;
}

/**
 * Runs Storyteller's normal deterministic segmenter and binds its result to a
 * whole-source cryptographic manifest plus complete word/non-whitespace
 * coverage proof. This is the preferred manuscript intake path for long-form
 * production because it fails closed before any generation job can be built.
 */
export function segmentManuscriptWithIntegrity(
  source: string,
  options: IntegrityCheckedSegmentationOptions = {},
): IntegrityCheckedSegmentation {
  const integrity = createManuscriptIntegrityManifest(source, {
    ...(options.sourceId ? { sourceId: options.sourceId } : {}),
    ...(options.targetChunkBytes !== undefined
      ? { targetChunkBytes: options.targetChunkBytes }
      : {}),
  });
  const verification = verifyManuscriptIntegrityManifest(source, integrity);
  if (!verification.ok) {
    throw new Error("MANUSCRIPT_INTEGRITY_VERIFICATION_FAILED");
  }

  const manuscript = segmentManuscript(source, {
    ...(options.maximumCharacters !== undefined
      ? { maximumCharacters: options.maximumCharacters }
      : {}),
    ...(options.projectId ? { projectId: options.projectId } : {}),
  });
  const coverage = auditManuscriptSegmentCoverage(
    source,
    manuscript.segments.map((segment) => ({
      id: segment.id,
      ordinal: segment.ordinal,
      sourceHash: segment.sourceHash,
      sourceStart: segment.sourceStart,
      sourceEnd: segment.sourceEnd,
      text: segment.text,
    })),
    {
      ...(options.locale ? { locale: options.locale } : {}),
      ...(options.maxDetailedFindings !== undefined
        ? { maxDetailedFindings: options.maxDetailedFindings }
        : {}),
    },
  );
  if (!coverage.ok) {
    throw new Error("MANUSCRIPT_SEGMENT_COVERAGE_INCOMPLETE");
  }

  return Object.freeze({
    manuscript,
    integrity,
    verification,
    coverage,
    fingerprint: stableHash({
      sourceHash: integrity.sourceHash,
      manifestFingerprint: integrity.fingerprint,
      verificationFingerprint: verification.fingerprint,
      coverageFingerprint: coverage.fingerprint,
      segmentIds: manuscript.segments.map((segment) => segment.id),
    }),
  });
}
