export type ProjectKind = 'standalone-book' | 'series';

export type ApprovalState =
  'draft' | 'awaiting-review' | 'changes-requested' | 'approved' | 'locked';

export interface StoryProject {
  id: string;
  title: string;
  kind: ProjectKind;
  seriesTitle?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PerformanceDirection {
  narrativeDistance: 'intimate' | 'close' | 'balanced' | 'formal' | 'mythic';
  defaultPace: number;
  energy: number;
  warmth: number;
  restraint: number;
  clarity: number;
  notes: string[];
}

export interface VoiceProfile {
  id: string;
  projectId: string;
  role: 'narrator' | 'character';
  characterId?: string;
  displayName: string;
  providerId: string;
  providerVoiceId: string;
  direction: PerformanceDirection;
  consentRecordId?: string;
  approvalState: ApprovalState;
  revision: number;
}

export interface PronunciationEntry {
  id: string;
  writtenForm: string;
  phoneticForm?: string;
  audioReferenceId?: string;
  language?: string;
  context?: string;
  approvalState: ApprovalState;
}

export interface PerformanceSegment {
  id: string;
  manuscriptRevisionId: string;
  startOffset: number;
  endOffset: number;
  speakerId?: string;
  emotionalObjective: string;
  subtext?: string;
  pace: number;
  intensity: number;
  pauseBeforeMs: number;
  pauseAfterMs: number;
  emphasis: string[];
  pronunciationEntryIds: string[];
  continuityReferenceIds: string[];
  approvalState: ApprovalState;
}
