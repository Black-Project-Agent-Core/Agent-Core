import { expect, it } from 'vitest';
import { input, load } from './helpers/retrieval-report-fixtures.js';
it('matches the four-front GEPA coverage reduction without a global winner',async()=>{
  const {reduceCoverageFronts}=await load('retrieval-portfolio');
  const r=reduceCoverageFronts([[0,2],[1,2],[0],[1]],[1,1,1],['a','b','c']);
  expect(r.kept).toEqual([0,1]);expect(r.fronts).toEqual([[0],[1],[0],[1]]);expect(r.coverageLoss).toBe(0);
});
it('union coverage can remove a candidate without any single dominator',async()=>{
  const {reduceCoverageFronts}=await load('retrieval-portfolio');
  const r=reduceCoverageFronts([[0,1],[0,2],[1],[2]],[1,1,1],['a','b','c']);
  expect(r.kept).toEqual([1,2]);expect(r.coverageLoss).toBe(0);expect(r.excluded).toContain(0);
});
it('retains unique specialists and uses stable identity tie order',async()=>{
  const {reduceCoverageFronts}=await load('retrieval-portfolio');
  expect(reduceCoverageFronts([[0],[1]],[0.5,0.5],['a','b']).kept).toEqual([0,1]);
  const a=reduceCoverageFronts([[0,1]],[1,1],['a','b']);
  const b=reduceCoverageFronts([[1,0]],[1,1],['b','a']);
  expect(a.kept.map((i:number)=>['a','b'][i])).toEqual(b.kept.map((i:number)=>['b','a'][i]));
});
it('empty and all-zero fronts produce no winners',async()=>{
  const {reduceCoverageFronts}=await load('retrieval-portfolio');
  expect(reduceCoverageFronts([],[],[]).kept).toEqual([]);
  const r=reduceCoverageFronts([[],[]],[0,0],['a','b']);expect(r.kept).toEqual([]);expect(r.uncovered).toEqual([0,1]);
});
for(const bad of [-1,2,0.5,'0',null,NaN])it(`rejects invalid candidate index ${String(bad)}`,async()=>{
  const {reduceCoverageFronts}=await load('retrieval-portfolio');expect(()=>reduceCoverageFronts([[bad]],[1,1],['a','b'])).toThrow();
});
it('rejects duplicate memberships, invalid scores and excess matrix dimensions',async()=>{
  const {reduceCoverageFronts}=await load('retrieval-portfolio');
  expect(()=>reduceCoverageFronts([[0,0]],[1],['a'])).toThrow();
  expect(()=>reduceCoverageFronts([[0]],[Infinity],['a'])).toThrow();
  expect(()=>reduceCoverageFronts([],Array(101).fill(1),Array.from({length:101},(_,i)=>String(i)))).toThrow();
  expect(()=>reduceCoverageFronts(Array.from({length:10001},()=>[]),[],[])).toThrow();
});
it('constructs a bounded profile shortlist and refuses incompatible baselines',async()=>{
  const {createRetrievalPortfolio}=await load('retrieval-portfolio'),{deriveRetrievalProfile}=await load('retrieval-profile');
  const x=input([false,false],[true,false]),y=input([false,false],[false,true],{experimentId:'second'});
  const a=deriveRetrievalProfile(x.c,x.o,x.score),b=deriveRetrievalProfile(y.c,y.o,y.score);
  const r=createRetrievalPortfolio([a,b],1);expect(r.shortlist).toHaveLength(2);expect(r.coverageLoss).toBe(0);
  expect(r.queries.queryIds).toHaveLength(1);expect(r.queries.omitted).toBe(1);expect(r.inputs).toHaveLength(2);
  const z=input([false,false],[true,true],{baselineRevision:'other'}),c=deriveRetrievalProfile(z.c,z.o,z.score);
  expect(()=>createRetrievalPortfolio([a,c])).toThrow();expect(()=>createRetrievalPortfolio([a,a])).toThrow();
});
