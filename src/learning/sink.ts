import type { LearningCandidate } from './types.js';

export interface LearningSinkHealth {
  available: boolean;
  issue?: string;
}

export interface LearningCaptureResult {
  id?: string;
  raw?: unknown;
}

export interface LearningSink {
  readonly name: string;
  isAvailable(): Promise<boolean>;
  health(): Promise<LearningSinkHealth>;
  classifySupport(candidate: LearningCandidate): boolean;
  findDuplicates(candidate: LearningCandidate): Promise<Array<{ id?: string; reason: string }>>;
  capture(candidate: LearningCandidate): Promise<LearningCaptureResult>;
}
