import type { MemoryContextFamily, VaultSegment } from './types.js';

export const DEFAULT_SEGMENT_PRESSURE = {
  softSizePressureBytes: 128 * 1024,
  hardSizeCeilingBytes: 256 * 1024,
  softEntryPressure: 64,
} as const;

export interface SegmentWithSize extends VaultSegment { byteSize?: number }
export interface SegmentPlacementInput {
  segments: SegmentWithSize[];
  contextFamily: MemoryContextFamily;
  principalId: string;
  projectId: string;
  topicKey: string;
  prospectiveBytes: number;
  semanticDistinct: boolean;
}
export type SegmentPlacement = {
  action: 'reuse' | 'successor' | 'new_root';
  segment?: SegmentWithSize;
  reasonCode: 'MATCHING_SEGMENT' | 'SEMANTIC_PRESSURE' | 'HARD_SIZE_CEILING' | 'NO_MATCHING_CHAIN';
};

export function chooseSegment(input: SegmentPlacementInput): SegmentPlacement {
  const matching = input.segments
    .filter(s => s.contextFamily === input.contextFamily && s.principalId === input.principalId && s.projectId === input.projectId && s.topicKey === input.topicKey)
    .sort((a,b) => b.segmentNo - a.segmentNo || a.relativePath.localeCompare(b.relativePath));
  const current = matching[0];
  if (!current) return { action:'new_root', reasonCode:'NO_MATCHING_CHAIN' };
  if (input.prospectiveBytes > DEFAULT_SEGMENT_PRESSURE.hardSizeCeilingBytes) {
    return { action:'successor', segment:current, reasonCode:'HARD_SIZE_CEILING' };
  }
  const soft = (current.byteSize ?? 0) >= DEFAULT_SEGMENT_PRESSURE.softSizePressureBytes
    || current.entries.length >= DEFAULT_SEGMENT_PRESSURE.softEntryPressure
    || input.prospectiveBytes >= DEFAULT_SEGMENT_PRESSURE.softSizePressureBytes;
  if (soft && input.semanticDistinct) return { action:'successor', segment:current, reasonCode:'SEMANTIC_PRESSURE' };
  return { action:'reuse', segment:current, reasonCode:'MATCHING_SEGMENT' };
}
