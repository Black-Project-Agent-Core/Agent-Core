import {describe,expect,it} from 'vitest';
import {createRetrievalBudget,parseRetrievalPlan,recordRetrievalBytes,reserveRetrievalCall} from '../../src/memory/subquestion-retrieval.js';
const plan={version:1,rootQuery:'Compare decisions and explain the correction',questions:[{id:'q1',query:'First decision?'},{id:'q2',query:'Corrected decision?'}]};
describe('bounded subquestion contract',()=>{
 it('rejects_fifth_question_duplicate_unknown_field',()=>{
  expect(parseRetrievalPlan(plan)).toEqual(plan);
  for(const input of [
   {...plan,questions:Array.from({length:5},(_,i)=>({id:'q'+(i+1),query:'Question '+i}))},
   {...plan,questions:[{id:'q1',query:' same '},{id:'q2',query:'same'}]},
   {...plan,questions:[{id:'q1',query:'one'},{id:'q1',query:'two'}]},
   {...plan,execute:'shell'},
   {...plan,questions:[{id:'q1',query:'one',tool:{name:'delete'}},{id:'q2',query:'two'}]},
   {...plan,rootQuery:'   '}, {...plan,rootQuery:'x'.repeat(2001)},
   {...plan,questions:[{id:'root',query:'one'},{id:'q2',query:'two'}]},
   {...plan,questions:[{id:'q1',query:''},{id:'q2',query:'two'}]},
   {...plan,questions:[{id:'q1',query:'one'}]}, {...plan,version:2},
  ])expect(()=>parseRetrievalPlan(input)).toThrow();
  expect(parseRetrievalPlan({...plan,rootQuery:' 🧠 ',questions:[]})).toEqual({version:1,rootQuery:'🧠',questions:[]});
  expect(parseRetrievalPlan({...plan,rootQuery:'🧠'.repeat(2000),questions:[]}).rootQuery).toHaveLength(4000);
 });
 it('counts_root_retry_and_continuation',()=>{
  const budget=createRetrievalBudget(10);
  for(let i=0;i<6;i++){expect(reserveRetrievalCall(budget,'recall',11+i)).toEqual({allowed:true,maxBytes:4096});recordRetrievalBytes(budget,100);}
  expect(budget.recallCalls).toBe(6);expect(reserveRetrievalCall(budget,'recall',20)).toMatchObject({allowed:false,maxBytes:0,reason:'recall-call-limit'});
  for(let i=0;i<2;i++){expect(reserveRetrievalCall(budget,'expand',21+i).allowed).toBe(true);recordRetrievalBytes(budget,100);}
  expect(reserveRetrievalCall(budget,'expand',24)).toMatchObject({allowed:false,reason:'expand-call-limit'});
 });
 it('deadline_stops_dispatch',()=>{
  const budget=createRetrievalBudget(100);
  expect(reserveRetrievalCall(budget,'recall',15099).allowed).toBe(true);recordRetrievalBytes(budget,0);
  expect(reserveRetrievalCall(budget,'recall',15100)).toMatchObject({allowed:false,reason:'deadline'});
  expect(budget.recallCalls).toBe(1);
 });
 it('remaining_below_512_stops',()=>{
  const budget=createRetrievalBudget(0);budget.remainingBytes=511;
  expect(reserveRetrievalCall(budget,'recall',1)).toMatchObject({allowed:false,reason:'payload-budget'});
  budget.remainingBytes=512;expect(reserveRetrievalCall(budget,'recall',1)).toEqual({allowed:true,maxBytes:512});recordRetrievalBytes(budget,512);
  expect(budget.remainingBytes).toBe(0);
 });
 it('rejects oversized responses without silent truncation and fails closed after violation',()=>{
  const budget=createRetrievalBudget(0);reserveRetrievalCall(budget,'recall',0);recordRetrievalBytes(budget,4097);
  expect(budget.protocolViolation).toBe(true);expect(budget.remainingBytes).toBe(32768-4097);
  expect(reserveRetrievalCall(budget,'recall',1)).toMatchObject({allowed:false,reason:'protocol-violation'});
 });
 it('enforces one serial reservation and validates clock and byte accounting',()=>{
  const budget=createRetrievalBudget(5);reserveRetrievalCall(budget,'recall',6);
  expect(reserveRetrievalCall(budget,'expand',7)).toMatchObject({allowed:false,reason:'call-in-flight'});
  for(const bytes of [-1,NaN,Infinity,1.5])expect(()=>recordRetrievalBytes(budget,bytes)).toThrow();
  recordRetrievalBytes(budget,0);expect(()=>recordRetrievalBytes(budget,1)).toThrow();
  expect(reserveRetrievalCall(budget,'recall',4)).toMatchObject({allowed:false,reason:'clock-regressed'});
  expect(()=>createRetrievalBudget(NaN)).toThrow();expect(()=>reserveRetrievalCall(budget,'recall',NaN)).toThrow();
 });
});
