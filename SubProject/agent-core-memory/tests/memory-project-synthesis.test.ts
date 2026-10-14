import {expect,test} from 'vitest';
import * as synthesis from '../src/memory/project-synthesis.js';
import {legacyExperience} from '../src/memory/experience-types.js';
const ref=(i=0)=>({kind:'memory' as const,id:`source-${i}`,revision:'sha256:'+String(i%10).repeat(64)});
const value=()=>({schemaVersion:1 as const,projectKey:'agent-core',claims:[{text:'Observed constraint',refs:[ref()]}],gaps:[]});
test('P15 stable bounded envelope preserves complete Unicode claims and exact citations',()=>{
 const input=value();input.claims[0].text='Unicode 🧠 proyek';const encoded=synthesis.encodeProjectSynthesis(input);expect(synthesis.decodeProjectSynthesis(encoded)).toEqual(input);expect(synthesis.encodeProjectSynthesis(synthesis.decodeProjectSynthesis(encoded)!)).toBe(encoded);
 for(const bad of [{...input,claims:[]},{...input,claims:Array.from({length:17},()=>input.claims[0])},{...input,claims:[{text:'No citation',refs:[]}]},{...input,claims:[{text:'Too many refs',refs:Array.from({length:33},(_,i)=>ref(i))}]},{...input,claims:[{text:'🧠'.repeat(3000),refs:[ref()]}]},{...input,unknown:true}])expect(()=>synthesis.encodeProjectSynthesis(bad as any)).toThrow();
 expect(synthesis.decodeProjectSynthesis('{broken')).toBeNull();expect(synthesis.decodeProjectSynthesis('ordinary note')).toBeNull();
});
test('P15 exact UTF-8 8192 byte limit rejects 8193 without trimming claim or citation',()=>{
 const input=value();const size=Buffer.byteLength(synthesis.encodeProjectSynthesis(input));input.claims[0].text+='x'.repeat(8192-size);expect(Buffer.byteLength(synthesis.encodeProjectSynthesis(input))).toBe(8192);input.claims[0].text+='x';expect(()=>synthesis.encodeProjectSynthesis(input)).toThrow();
});
test('P15 action binds exact union, rejects self-reference and fabricated verifier metadata',()=>{
 const input=value();input.claims.push({text:'Another claim',refs:[ref(1),ref()]});const action:any=synthesis.buildProjectSynthesisAction({actionId:'synthesis-create',value:input,experience:legacyExperience()});expect(action.kind).toBe('create');expect(action.value.category).toBe('project-synthesis');expect(action.inputRefs).toHaveLength(2);expect(action.value.experience.sourceRefs).toEqual(action.inputRefs);
 expect(()=>synthesis.buildProjectSynthesisAction({actionId:'synthesis-amend',value:input,experience:legacyExperience(),target:ref()})).toThrow();expect(()=>synthesis.buildProjectSynthesisAction({actionId:'synthesis-create',value:input,experience:{...legacyExperience(),verification:{status:'supported',evidence:[ref()],method:'invented'}}})).toThrow();
});
test('P15 dependency resolution is bounded, deduplicated and preserves unknown over unavailable claims',async()=>{
 const input=value();input.claims.push({text:'Shared source',refs:[ref()]});let calls=0;expect(await synthesis.checkProjectSynthesisDependencies(input,async()=>{calls++;return 'current';})).toEqual({status:'current',invalidRefs:[]});expect(calls).toBe(1);
 expect(await synthesis.checkProjectSynthesisDependencies(input,async()=> 'stale')).toEqual({status:'stale',invalidRefs:[ref()]});expect((await synthesis.checkProjectSynthesisDependencies(input,async()=>{throw new Error('unavailable');})).status).toBe('unknown');
});
