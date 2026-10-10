import type { MemoryRecordV1, MemoryRecordV2 } from './types.js';
import { legacyExperience } from './experience-types.js';
import { normalizeRecord } from './note-format.js';

/** Pure available-snapshot conversion. It cannot reconstruct previously pruned history. */
export function upgradeLegacySnapshot(records: MemoryRecordV1[]): MemoryRecordV2[] {
  return records.map(record => {
    if (record.version !== 1) throw new Error('MEMORY_MIGRATION_SOURCE_NOT_V1');
    return normalizeRecord({...structuredClone(record),version:2,experience:legacyExperience()},record.content) as MemoryRecordV2;
  });
}
