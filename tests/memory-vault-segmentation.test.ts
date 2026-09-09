import { describe, expect, it } from 'vitest';
import { chooseSegment } from '../src/memory/file-native/segment-placement.js';
import type { VaultSegment } from '../src/memory/file-native/types.js';

function segment(family='coding', topic='memory', bytes=1024, entries=1): VaultSegment & { byteSize: number } {
  return { schemaVersion:1,fileId:'mf_a',relativePath:'Coding/memory-A.md',contextFamily:family as any,projectId:'p',topicKey:topic,segmentNo:1,createdAt:'x',updatedAt:'x',entries:Array.from({length:entries},(_,i)=>({memoryId:`m${i}`,revisionId:`r${i}`,revisionNo:1,canonicalKey:`k${i}`,kind:'fact',state:'active',importance:.5,pinned:false,enforcement:'none',valueText:'x',valueHash:'h',createdAt:1,updatedAt:1,relations:[]})),byteSize:bytes };
}

describe('hybrid segment placement', () => {
  it('reuses the latest matching family/topic segment before creating a new file', () => {
    expect(chooseSegment({ segments:[segment()], contextFamily:'coding', projectId:'p', topicKey:'memory', prospectiveBytes:5000, semanticDistinct:false }).action).toBe('reuse');
  });
  it('soft pressure only triggers semantic evaluation, not an automatic split', () => {
    expect(chooseSegment({ segments:[segment('coding','memory',140000,64)], contextFamily:'coding', projectId:'p', topicKey:'memory', prospectiveBytes:150000, semanticDistinct:false }).action).toBe('reuse');
    expect(chooseSegment({ segments:[segment('coding','memory',140000,64)], contextFamily:'coding', projectId:'p', topicKey:'memory', prospectiveBytes:150000, semanticDistinct:true }).action).toBe('successor');
  });
  it('forces a same-family successor when prospective content exceeds 256 KiB', () => {
    const r=chooseSegment({ segments:[segment()], contextFamily:'coding', projectId:'p', topicKey:'memory', prospectiveBytes:262145, semanticDistinct:false });
    expect(r.action).toBe('successor'); expect(r.segment?.contextFamily).toBe('coding');
  });

  it('does not reuse the same family/topic chain from another project scope', () => {
    const other={...segment(),projectId:'other-project'};
    expect(chooseSegment({segments:[other],contextFamily:'coding',projectId:'p',topicKey:'memory',prospectiveBytes:1000,semanticDistinct:false}).action).toBe('new_root');
  });
  it('does not treat a different context family as a continuation candidate', () => {
    expect(chooseSegment({ segments:[segment('brainstorming')], contextFamily:'coding', projectId:'p', topicKey:'memory', prospectiveBytes:1000, semanticDistinct:false }).action).toBe('new_root');
  });
});
