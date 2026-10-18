import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {afterEach,describe,expect,it} from 'vitest';
import {initializeMemoryRoot} from '../../../src/memory/facade.js';
import {assessEvidenceLineage} from '../../../src/memory/evidence-lineage.js';
import {memorySemanticRevision} from '../../../src/memory/disclosure.js';
import {progressiveMemoryDetail} from '../../../src/memory/progressive-disclosure.js';
import {formatDeliveredMemorySearchResult} from '../../../src/memory/search-projection.js';
import type {MemoryRecord} from '../../../src/memory/types.js';
const roots:string[]=[];
afterEach(async()=>{await Promise.all(roots.splice(0).map(root=>rm(root,{recursive:true,force:true})));});
const digest=(char:string)=>'sha256:'+char.repeat(64);
function note(id:string):MemoryRecord {
  return {version:1,id,title:id,content:id,keywords:[],context:'',tags:[],category:'test',
    links:[],createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z',
    lastAccessedAt:null,retrievalCount:0,evolutionHistory:[],pinned:false};
}
describe('F2 canonical evidence lineage',()=>{
  it('correlates exact immutable source references but never counts bare identities as independent',()=>{
    const left={...note('left'),version:2 as const,experience:{
      schemaVersion:1 as const,kind:'note' as const,retention:'durable' as const,
      epistemic:'unknown' as const,temporal:'unknown' as const,validity:{state:'unknown' as const},
      verification:{status:'unverified' as const,evidence:[]},
      sourceRefs:[{kind:'artifact' as const,id:'upstream-anchor',revision:digest('a')}] }};
    const right={...left,id:'right',experience:{...left.experience}};
    const unrelated=note('unrelated');
    const result=assessEvidenceLineage([left,right,unrelated]);
    expect(result.get('left')).toMatchObject({status:'shared-origin',peers:['right'],basis:'exact-source-ref'});
    expect(result.get('right')).toMatchObject({status:'shared-origin',peers:['left']});
    expect(result.get('unrelated')).toEqual({status:'unknown'});
    right.experience={...right.experience,sourceRefs:[{kind:'artifact',id:'upstream-anchor',revision:digest('b')}]};
    expect(assessEvidenceLineage([left,right]).get('left')).toEqual({status:'unknown'});
  });
  it('honors time-bounded derived-from links instead of inventing historical ancestry',()=>{
    const a=note('first'),b=note('second');
    const born='2026-06-01T00:00:00Z';
    a.links=[{type:'derived-from',targetId:'shared-root',strength:1,createdAt:born,validFrom:born}];
    b.links=[{...a.links[0]!}];
    expect(assessEvidenceLineage([a,b],[a,b],Date.parse('2026-05-01T00:00:00Z')).get('first'))
      .toEqual({status:'unknown'});
    expect(assessEvidenceLineage([a,b],[a,b],Date.parse('2026-07-01T00:00:00Z')).get('first'))
      .toMatchObject({status:'shared-origin',peers:['second']});
  });
  it('only groups observed matching captured file bytes, not shared git HEAD or workspace',()=>{
    const make=(id:string,file:string,hash:string)=>{
      const row=note(id);
      row.provenance={workspace:'agent-core',files:[file],gitCommit:'a'.repeat(40),
        sourceSnapshot:{version:1,observedAt:'2026-01-01T00:00:00Z',
          files:[{path:file,status:'captured',digest:hash,bytes:12}]}};
      return row;
    };
    const a=make('a','src/one.ts',digest('c')), b=make('b','src/one.ts',digest('c'));
    const c=make('c','src/two.ts',digest('c'));
    expect(assessEvidenceLineage([a,b,c]).get('a')).toMatchObject({status:'shared-origin',peers:['b'],basis:'captured-source'});
    expect(assessEvidenceLineage([a,c]).get('a')).toEqual({status:'unknown'});
    b.provenance!.sourceSnapshot!.files=[{path:'src/one.ts',status:'unavailable',reason:'read-budget'}];
    expect(assessEvidenceLineage([a,b]).get('a')).toEqual({status:'unknown'});
  });
  it('uses derived-from ancestry, ignores supports and never exposes an undisclosed peer',()=>{
    const parent=note('root');
    const a=note('a'),b=note('b'),c=note('c');
    a.links=[{type:'derived-from',targetId:'root',strength:1,createdAt:'2026-01-01T00:00:00Z'}];
    b.links=[{...a.links[0]!}];
    c.links=[{type:'supports',targetId:'root',strength:1,createdAt:'2026-01-01T00:00:00Z'}];
    const result=assessEvidenceLineage([a,b,c],[parent,a,b,c]);
    expect(result.get('a')).toMatchObject({status:'shared-origin',peers:['b']});
    expect(result.get('c')).toEqual({status:'unknown'});
    expect(assessEvidenceLineage([a,c],[parent,a,b,c]).get('a')).toEqual({status:'unknown'});
  });
});
describe('F3 progressive disclosure across internal Memory owners',()=>{
  it('keeps exact SourceRef and produces no hint without omitted source content',()=>{
    const item=note('detail');
    expect(progressiveMemoryDetail(item,false,'delivery-truncated')).toBeUndefined();
    expect(progressiveMemoryDetail(item,true,'delivery-truncated',
      {kind:'memory',id:'detail',revision:digest('e')})).toBeUndefined();
    expect(progressiveMemoryDetail(item,true,'excerpt-incomplete')).toMatchObject({
      action:'expand-if-needed',source:{kind:'memory',id:'detail',revision:memorySemanticRevision(item)}
    });
  });
  it('serves shared-origin flags and conditional expansion from the real internal search and session',async()=>{
    const root=await mkdtemp(path.join(os.tmpdir(),'memory-f2f3-'));roots.push(root);
    const memory=await initializeMemoryRoot({baseDir:root,memoryRoot:root});
    const content=(suffix:string)=>'nexussignal '+suffix+' '+suffix.repeat(3000);
    await memory.batch([
      {op:'remember',id:'f2-root',value:{content:'primary upstream evidence',provenance:{workspace:'agent-core',files:[]}}},
      {op:'remember',id:'f2-a',value:{content:content('A'),links:[{targetId:'f2-root',type:'derived-from',strength:1}],
        provenance:{workspace:'agent-core',files:[]}}},
      {op:'remember',id:'f2-b',value:{content:content('B'),links:[{targetId:'f2-root',type:'derived-from',strength:1}],
        provenance:{workspace:'agent-core',files:[]}}},
      {op:'remember',id:'f2-c',value:{content:'nexussignal independent',
        provenance:{workspace:'agent-core',files:[]}}},
    ]);
    const search=await memory.search('nexussignal',{workspace:'agent-core',limit:5,budgetChars:20000});
    const group=new Map(search.map(row=>[row.record.id,row]));
    expect(group.get('f2-a')?.evidenceLineage).toMatchObject({status:'shared-origin'});
    expect(group.get('f2-a')?.evidenceLineage?.peers).toContain('f2-b');
    expect(group.get('f2-b')?.evidenceLineage).toMatchObject({status:'shared-origin'});
    expect(group.get('f2-b')?.evidenceLineage?.peers).toContain('f2-a');
    expect(group.get('f2-c')?.evidenceLineage).toEqual({status:'unknown'});
    const constrained=await memory.search('nexussignal AAAAAAAAAAAA',{workspace:'agent-core',limit:1,budgetChars:1200});
    expect(constrained).toHaveLength(1);
    expect(constrained[0]!.delivery.truncated).toBe(true);
    const nativeView=formatDeliveredMemorySearchResult(constrained[0]!);
    expect(nativeView.detailHint).toMatchObject({action:'expand-if-needed',view:'record',
      reason:'delivery-truncated',source:{kind:'memory',id:constrained[0]!.record.id}});
    const session=memory.controller({workspaceKey:'agent-core',taskId:'f2-f3-real',controllerId:'native-fixture'});
    const response=await session.recall({query:'nexussignal',limit:5,budget:{maxBytes:16384}});
    if(response.status==='insufficient-budget')throw new Error('unexpected budget failure');
    const hits=new Map(response.data.hits.map(hit=>[hit.id,hit]));
    expect(hits.get('f2-a')?.evidenceLineage).toMatchObject({status:'shared-origin'});
    expect(hits.get('f2-a')?.evidenceLineage?.peers).toContain('f2-b');
    expect(hits.get('f2-c')?.evidenceLineage).toEqual({status:'unknown'});
    const hit=hits.get('f2-a')!;
    expect(hit.detailHint).toMatchObject({action:'expand-if-needed',reason:'excerpt-incomplete',
      source:{kind:'memory',id:'f2-a',revision:hit.revision}});
    const expanded=await session.expand({view:'record',source:hit.detailHint!.source,budget:{maxBytes:65536}});
    if(expanded.status==='insufficient-budget')throw new Error('unexpected expand failure');
    expect(JSON.parse(expanded.data.text).content).toBe(content('A'));
    expect(hits.get('f2-c')?.detailHint).toBeUndefined();
    const one=await session.recall({query:'nexussignal',limit:1,budget:{maxBytes:8000}});
    if(one.status==='insufficient-budget')throw new Error('unexpected page failure');
    expect(one.data.hits).toHaveLength(1);
    expect(one.data.hits[0]!.evidenceLineage).toBeUndefined();
  });
});
