import { expect, test } from 'vitest';
import { assertCapsuleContentIntegrity } from '../src/memory/capsule-integrity.js';
import { renderTaskCapsule } from '../src/memory/capsule.js';
import type { WorkingItem } from '../src/memory/experience-types.js';
const ref = { kind: 'episode' as const, id: 'episode-integrity', revision: 'sha256:' + 'a'.repeat(64) };
const workingState: WorkingItem[] = ['goal','constraint','blocker','changed-file','important-id'].map((kind,index) => ({ id: 'item-'+index, kind: kind as WorkingItem['kind'], text: ['value 1.25 🧠','Never release','Unverified issue','src/CaseSensitive.ts','ID_Exact_29'][index]!, critical: false, state: 'active', sourceRefs: [ref], verification: { status: 'unverified', evidence: [] } }));
const input = { id: 'capsule-integrity', header: { id: ref.id, revision: 1, taskId: 'task-integrity' } as any, generatedAt: '2026-10-10T00:00:00Z', trigger: 'explicit' as const, workingState, events: [], episodeRef: ref, maxBytes: 65536 };
function capsule(){const result=renderTaskCapsule(input);if(result.status==='insufficient-budget')throw Error('fixture overflow');return result.data;}
test('exact mandatory content, uncertainty and source revisions survive and one-byte edits fail',()=>{
 const value=capsule();expect(()=>assertCapsuleContentIntegrity({workingState,capsule:value,episodeRef:ref})).not.toThrow();
 for(const edit of [(v:any)=>v.criticalItems[0].text='value 1.26 🧠',(v:any)=>v.criticalItems[3].text='src/caseSensitive.ts',(v:any)=>v.criticalItems[1].text='May release',(v:any)=>v.criticalItems[2].verification.status='verified',(v:any)=>v.sourceRefs[0].revision='sha256:'+'b'.repeat(64)]){
  const changed=structuredClone(value);edit(changed);expect(()=>assertCapsuleContentIntegrity({workingState,capsule:changed,episodeRef:ref})).toThrow('MEMORY_SOURCE_UNAVAILABLE');
 }
});
test('missing or duplicate IDs, undisclosed omissions and fabricated support fail',()=>{
 const support={...workingState[0]!,id:'support',kind:'failed-path' as const,critical:false,text:'Supporting history'};
 const full=[...workingState,support],result=renderTaskCapsule({...input,workingState:full});if(result.status==='insufficient-budget')throw Error('fixture');
 for(const edit of [(v:any)=>v.criticalItems.pop(),(v:any)=>v.criticalItems.push(v.criticalItems[0]),(v:any)=>v.supportingItems=[],(v:any)=>v.omittedSupportingItemIds.push('invented'),(v:any)=>v.supportingItems[0].text='Invented']){
  const changed=structuredClone(result.data);edit(changed);expect(()=>assertCapsuleContentIntegrity({workingState:full,capsule:changed,episodeRef:ref})).toThrow('MEMORY_SOURCE_UNAVAILABLE');
 }
 expect(()=>renderTaskCapsule({...input,workingState:[...workingState,workingState[0]!]})).toThrow('MEMORY_SOURCE_UNAVAILABLE');
});
test('UTF-8 exact mandatory envelope fits; one byte below is explicit insufficient-budget',()=>{
 const full=renderTaskCapsule(input);expect(full.status).toBe('ok');
 expect(renderTaskCapsule({...input,maxBytes:full.metrics.payloadBytes})).toEqual(full);
 const short=renderTaskCapsule({...input,maxBytes:full.metrics.payloadBytes-1});expect(short.status).toBe('insufficient-budget');expect(short.warnings).toContain('mandatory-capsule-over-budget');expect(short).not.toHaveProperty('data');
});
