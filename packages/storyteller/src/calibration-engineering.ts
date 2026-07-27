import {
  assertAudioEngineeringEvidence,
  type AudioEngineeringEvidence,
} from "./audio-engineering.js";
import {
  assertArtifactRecord,
  type ArtifactRecord,
} from "./artifact-registry.js";
import {
  addCalibrationCandidate,
  assertCalibrationSession,
  type CalibrationCandidate,
  type CalibrationSession,
} from "./calibration-workflow.js";

export interface EngineeringBackedCalibrationCandidateInput {
  session: CalibrationSession;
  candidate: Omit<CalibrationCandidate, "fingerprint">;
  audioCandidate: ArtifactRecord;
  transcriptAssessment: ArtifactRecord;
  engineeringArtifact: ArtifactRecord;
  engineeringEvidence: AudioEngineeringEvidence;
  now?: Date;
}

export class CalibrationEngineeringAdmissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalibrationEngineeringAdmissionError";
  }
}

function requireVerified(record: ArtifactRecord, code: string): void {
  if (
    record.verification.status !== "verified"
    || record.verification.findings.some((finding) => finding.severity === "error")
    || record.quarantine
  ) {
    throw new CalibrationEngineeringAdmissionError(code);
  }
}

function requireSameScope(
  expected: ArtifactRecord,
  actual: ArtifactRecord,
  code: string,
): void {
  if (
    actual.projectId !== expected.projectId
    || actual.jobId !== expected.jobId
    || actual.segmentId !== expected.segmentId
    || actual.takeId !== expected.takeId
  ) {
    throw new CalibrationEngineeringAdmissionError(code);
  }
}

function requireParent(record: ArtifactRecord, parentId: string, code: string): void {
  if (!record.provenance.parentArtifactIds.includes(parentId)) {
    throw new CalibrationEngineeringAdmissionError(code);
  }
}

function requireChronology(
  earlier: string,
  later: string,
  code: string,
): void {
  const earlierTime = Date.parse(earlier);
  const laterTime = Date.parse(later);
  if (
    Number.isNaN(earlierTime)
    || Number.isNaN(laterTime)
    || laterTime < earlierTime
  ) {
    throw new CalibrationEngineeringAdmissionError(code);
  }
}

export function admitEngineeringBackedCalibrationCandidate(
  input: EngineeringBackedCalibrationCandidateInput,
): CalibrationSession {
  assertCalibrationSession(input.session);
  assertAudioEngineeringEvidence(input.engineeringEvidence);
  const { candidate, audioCandidate, transcriptAssessment, engineeringArtifact } = input;
  assertArtifactRecord(audioCandidate);
  assertArtifactRecord(transcriptAssessment);
  assertArtifactRecord(engineeringArtifact);

  if (audioCandidate.kind !== "audio-candidate") {
    throw new CalibrationEngineeringAdmissionError("CALIBRATION_ENGINEERING_AUDIO_CANDIDATE_REQUIRED");
  }
  if (engineeringArtifact.kind !== "audio-analysis") {
    throw new CalibrationEngineeringAdmissionError("CALIBRATION_ENGINEERING_ANALYSIS_ARTIFACT_REQUIRED");
  }
  if (
    transcriptAssessment.kind !== "transcript"
    && transcriptAssessment.kind !== "audio-analysis"
  ) {
    throw new CalibrationEngineeringAdmissionError("CALIBRATION_ENGINEERING_TRANSCRIPT_ARTIFACT_INVALID");
  }
  requireVerified(audioCandidate, "CALIBRATION_ENGINEERING_AUDIO_NOT_VERIFIED");
  requireVerified(transcriptAssessment, "CALIBRATION_ENGINEERING_TRANSCRIPT_NOT_VERIFIED");
  requireVerified(engineeringArtifact, "CALIBRATION_ENGINEERING_ANALYSIS_NOT_VERIFIED");
  requireSameScope(audioCandidate, transcriptAssessment, "CALIBRATION_ENGINEERING_TRANSCRIPT_SCOPE_MISMATCH");
  requireSameScope(audioCandidate, engineeringArtifact, "CALIBRATION_ENGINEERING_ANALYSIS_SCOPE_MISMATCH");
  requireParent(
    transcriptAssessment,
    audioCandidate.id,
    "CALIBRATION_ENGINEERING_TRANSCRIPT_PARENT_MISMATCH",
  );
  requireParent(
    engineeringArtifact,
    audioCandidate.id,
    "CALIBRATION_ENGINEERING_ANALYSIS_PARENT_MISMATCH",
  );

  if (
    candidate.takeArtifactId !== audioCandidate.id
    || candidate.transcriptAssessmentArtifactId !== transcriptAssessment.id
    || candidate.technicalAssessmentArtifactId !== engineeringArtifact.id
  ) {
    throw new CalibrationEngineeringAdmissionError("CALIBRATION_ENGINEERING_CANDIDATE_EVIDENCE_MISMATCH");
  }
  if (
    candidate.passageId.length === 0
    || candidate.voiceProfileId !== input.session.voiceProfileId
    || candidate.voiceRevision !== input.session.voiceRevision
  ) {
    throw new CalibrationEngineeringAdmissionError("CALIBRATION_ENGINEERING_CANDIDATE_SCOPE_MISMATCH");
  }
  if (
    input.engineeringEvidence.inputContentHash !== audioCandidate.integrity.contentHash
    || input.engineeringEvidence.inputByteCount !== audioCandidate.integrity.byteCount
    || engineeringArtifact.provenance.sourceContentHash !== audioCandidate.integrity.contentHash
  ) {
    throw new CalibrationEngineeringAdmissionError("CALIBRATION_ENGINEERING_CONTENT_BINDING_MISMATCH");
  }
  if (
    transcriptAssessment.rights.rightsFingerprint !== audioCandidate.rights.rightsFingerprint
    || engineeringArtifact.rights.rightsFingerprint !== audioCandidate.rights.rightsFingerprint
  ) {
    throw new CalibrationEngineeringAdmissionError("CALIBRATION_ENGINEERING_RIGHTS_SCOPE_MISMATCH");
  }
  if (
    !input.engineeringEvidence.eligible
    || input.engineeringEvidence.findings.some((finding) => finding.severity === "error")
    || !candidate.eligible
    || candidate.findingCodes.length > 0
  ) {
    throw new CalibrationEngineeringAdmissionError("CALIBRATION_ENGINEERING_EVIDENCE_INELIGIBLE");
  }
  requireChronology(
    audioCandidate.createdAt,
    input.engineeringEvidence.measuredAt,
    "CALIBRATION_ENGINEERING_MEASUREMENT_PRECEDES_AUDIO",
  );
  requireChronology(
    input.engineeringEvidence.measuredAt,
    engineeringArtifact.createdAt,
    "CALIBRATION_ENGINEERING_ARTIFACT_PRECEDES_MEASUREMENT",
  );
  requireChronology(
    engineeringArtifact.createdAt,
    candidate.createdAt,
    "CALIBRATION_ENGINEERING_CANDIDATE_PRECEDES_EVIDENCE",
  );

  return addCalibrationCandidate(
    input.session,
    candidate,
    input.now ?? new Date(candidate.createdAt),
  );
}
