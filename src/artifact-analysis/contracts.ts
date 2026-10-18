export type ArtifactFormat = 'directory-js' | 'asar' | 'managed-pe';
export type ArtifactOutcome = 'complete' | 'partial' | 'unsupported' | 'cancelled' | 'unavailable' | 'denied' | 'failed';
export interface ArtifactFinding {
  id: string; kind: string; classification: 'observed' | 'inferred' | 'unknown';
  summary: string; source: string; line?: number; offset?: number;
}
export interface ArtifactInspection {
  schemaVersion: 1; operation: 'inspect'; invocationId: string;
  subject: { sha256: string; size: number; scopeDigest: string; format: ArtifactFormat };
  analyzer: { revision: string; optionsDigest: string };
  outcome: ArtifactOutcome; execution: 'settled' | 'settlement-unknown';
  coverage: { inventory: number; selected: number; inspected: number; unavailable: number; omitted: number; notExamined: number;
    returnedFindings: number; droppedFindings: number; findingsTruncated: boolean };
  findings: ArtifactFinding[]; limitations: string[];
}
export type StaticInput = {
  format: ArtifactFormat; sha256: string; scopeDigest: string;
  files: Array<{ relative: string; size: number; bytes?: Uint8Array }>;
  archive?: Uint8Array;
  omissions: number;
};
export const ARTIFACT_LIMITS = Object.freeze({
  maxArtifactBytes: 128 * 1024 * 1024, maxAsarHeader: 16 * 1024 * 1024,
  maxSourceBytes: 2 * 1024 * 1024, maxTotalSourceBytes: 16 * 1024 * 1024,
  maxSelected: 64, maxInventory: 4096, maxDepth: 32,
  maxFindings: 256, maxEnvelopeBytes: 64 * 1024, maxWorkers: 2, maxDurationMs: 60_000,
});
