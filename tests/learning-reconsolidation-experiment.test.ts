import {expect,test} from 'vitest';
import {proposeFixtureRelations,type ReconsolidationFixture} from '../src/learning/reconsolidation-experiment.js';
const fixture=():ReconsolidationFixture=>({scopeKey:'scope',corpusRevision:'corpus-1',nodes:[{id:'a',revision:'a-1',scopeKey:'scope'},{id:'b',revision:'b-1',scopeKey:'scope'},{id:'c',revision:'c-1',scopeKey:'scope'}],outcomes:[{sourceId:'a',targetId:'b',sourceRevision:'a-1',targetRevision:'b-1',scopeKey:'scope',verifiedUseful:true,verifierRevision:'oracle-1'}]});
test('rejects_exposure_without_verified_outcome',()=>{
 const f=fixture();expect(proposeFixtureRelations({...f,outcomes:[]})).toEqual([]);
 expect(proposeFixtureRelations({...f,outcomes:[{...f.outcomes[0],verifiedUseful:false}]})).toEqual([]);
 expect(()=>proposeFixtureRelations({...f,outcomes:[{...f.outcomes[0],verifiedUseful:'true'}]} as any)).toThrow();
});
test('rejects_stale_or_missing_node',()=>{
 const f=fixture();for(const patch of [{targetId:'missing'},{sourceRevision:'stale'},{targetRevision:'stale'},{scopeKey:'foreign'},{verifierRevision:''},{sourceRevision:undefined}])expect(()=>proposeFixtureRelations({...f,outcomes:[{...f.outcomes[0],...patch}]} as any)).toThrow();
 expect(()=>proposeFixtureRelations({...f,nodes:[{...f.nodes[0],scopeKey:'foreign'},...f.nodes.slice(1)]})).toThrow();
});
test('rejects_self_duplicate_and_over_budget_edges',()=>{
 const f=fixture();expect(()=>proposeFixtureRelations({...f,outcomes:[{...f.outcomes[0],targetId:'a',targetRevision:'a-1'}]})).toThrow();
 expect(()=>proposeFixtureRelations({...f,outcomes:[f.outcomes[0],f.outcomes[0]]})).toThrow();
 const nodes=Array.from({length:10},(_,i)=>({id:'n'+i,revision:'r'+i,scopeKey:'scope'}));
 const outcomes=nodes.slice(1).map(n=>({...f.outcomes[0],sourceId:'n0',sourceRevision:'r0',targetId:n.id,targetRevision:n.revision}));
 expect(()=>proposeFixtureRelations({...f,nodes,outcomes})).toThrow();
 expect(()=>proposeFixtureRelations({...f,nodes:Array.from({length:33},(_,i)=>({id:'n'+i,revision:'r'+i,scopeKey:'scope'})),outcomes:[]})).toThrow();
});
test('orders_equal_proposals_deterministically',()=>{
 const f=fixture();f.outcomes.unshift({...f.outcomes[0],targetId:'c',targetRevision:'c-1'});const before=structuredClone(f);
 expect(proposeFixtureRelations(f)).toEqual([{sourceId:'a',targetId:'b',type:'related',sourceRevision:'a-1',targetRevision:'b-1',verifierRevision:'oracle-1'},{sourceId:'a',targetId:'c',type:'related',sourceRevision:'a-1',targetRevision:'c-1',verifierRevision:'oracle-1'}]);expect(f).toEqual(before);
});
test('conflicting_outcome_blocks_association',()=>{
 const f=fixture();expect(()=>proposeFixtureRelations({...f,outcomes:[f.outcomes[0],{...f.outcomes[0],verifiedUseful:false,verifierRevision:'oracle-2'}]})).toThrow();
});
