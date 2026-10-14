import type { MemoryRecord } from '../../../src/memory/types.js';
export const NOW = '2026-10-09T12:00:00.000Z';
export function record(id = 'oracle', patch: Partial<MemoryRecord> = {}): MemoryRecord {
  return { version:1,id,content:'ordinary durable fact',keywords:[],context:'General',tags:[],category:'Uncategorized',
    links:[],createdAt:NOW,updatedAt:NOW,lastAccessedAt:null,retrievalCount:0,evolutionHistory:[],pinned:false,...patch } as MemoryRecord;
}
export const LONG_ORACLES = 'HEAD_ORACLE ' + 'h'.repeat(9980) + ' MIDDLE_ORACLE ' + 't'.repeat(9980) + ' TAIL_ORACLE';
export const BASELINE_VECTORS = { oracleChildren:[[1,0],[0,1],[0,1],[0,1]], distractor:[0.8,0.6], query:[1,0] };
