import {memorySemanticRevision} from './disclosure.js';
import type {SourceRef} from './experience-types.js';
import type {MemoryRecord} from './types.js';

/** Controller guidance from actual omitted bytes, never an automatic extra read. */
export interface MemoryDetailHint {
  action:'expand-if-needed';
  view:'record';
  source:SourceRef;
  reason:'excerpt-incomplete'|'delivery-truncated';
}
export function progressiveMemoryDetail(
  record:MemoryRecord, omitted:boolean,
  reason:MemoryDetailHint['reason'], source?:SourceRef,
):MemoryDetailHint|undefined {
  if(!omitted)return undefined;
  const exact=source??{kind:'memory' as const,id:record.id,revision:memorySemanticRevision(record)};
  if(exact.kind!=='memory'||exact.id!==record.id||exact.revision!==memorySemanticRevision(record))
    return undefined;
  return {action:'expand-if-needed',view:'record',source:exact,reason};
}
