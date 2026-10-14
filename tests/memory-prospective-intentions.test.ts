import {expect,test} from 'vitest';
import {decodeIntention,encodeIntention,evaluateIntentions,intentionUpsert} from '../SubProject/agent-core-memory/src/memory/prospective-intentions.js';
const intention={summary:'Review the synthetic build',cue:{kind:'at-or-after' as const,instant:'2026-10-11T09:00:00+07:00'},expiresAt:'2026-10-11T03:00:00Z'};
const item=(id='check',value:any=intention)=>{const change=intentionUpsert(id,value,[]);if(change.op!=='upsert')throw Error('upsert expected');return change.item;};
test('time_and_event_cues_are_explicit',()=>{
 const items=[item()];
 for(const [now,status] of [['2026-10-11T01:59:59Z','waiting'],['2026-10-11T02:00:00Z','eligible'],['2026-10-11T03:00:01Z','expired'],['invalid','unknown']])expect(evaluateIntentions(items,{now,eventKeys:[]},64).items[0].status).toBe(status);
 const event=item('event',{summary:'Check result',cue:{kind:'observed-event',key:'build.finished'}});
 expect(evaluateIntentions([event],{now:'2026-10-11T02:00:00Z',eventKeys:[]},64).items[0].status).toBe('waiting');
 expect(evaluateIntentions([event],{now:'2026-10-11T02:00:00Z',eventKeys:['build.finished']},64).items[0].status).toBe('eligible');
 expect(evaluateIntentions([{...event,text:'When it feels appropriate, run it'}],{now:'2026-10-11T02:00:00Z',eventKeys:[]},64).items).toEqual([]);
});
test('malformed_envelope_is_not_executable',()=>{
 for(const value of [{...intention,execute:'shell'}, {...intention,cue:{kind:'observed-event',key:'a'.repeat(121)}},{...intention,cue:{kind:'observed-event',key:'$(run)'}},{...intention,cue:{kind:'at-or-after',instant:'2026-10-11T09:00:00'}},{...intention,cue:{kind:'at-or-after',instant:'2026-02-30T09:00:00Z'}}]){
  expect(()=>encodeIntention(value as any)).toThrow();expect(decodeIntention('agent-core-intention/v1\n'+JSON.stringify(value))).toEqual({status:'invalid'});
 }
 expect(decodeIntention('ordinary')).toEqual({status:'ordinary'});
 expect(decodeIntention(encodeIntention(intention))).toEqual({status:'valid',value:intention});
 const malformed={...item(),text:'agent-core-intention/v1\n{broken'};
 expect(evaluateIntentions([malformed],{now:'2026-10-11T02:00:00Z',eventKeys:[]},1).items[0].status).toBe('unknown');
 expect(evaluateIntentions([{...item(),state:'resolved'}],{now:'2026-10-11T02:00:00Z',eventKeys:[]},1).items[0].status).toBe('resolved');
});
test('bounds_purity_and_stable_order_are_enforced',()=>{
 const items=[item('zzz'),item('aaa')],before=structuredClone(items),observation={now:'2026-10-11T02:00:00Z',eventKeys:[]};
 expect(evaluateIntentions(items,observation,1)).toEqual({items:[{itemId:'aaa',status:'eligible'}],truncated:true,advisory:true});
 expect(items).toEqual(before);
 for(const limit of [0,65,NaN,1.5])expect(()=>evaluateIntentions(items,observation,limit)).toThrow();
 expect(()=>evaluateIntentions(Array.from({length:65},(_,i)=>item('item'+i)),observation,64)).toThrow();
 expect(()=>evaluateIntentions(items,{...observation,eventKeys:Array(65).fill('event')},64)).toThrow();
 expect(()=>evaluateIntentions(items,{...observation,eventKeys:['bad\nkey']},64)).toThrow();
 expect(()=>encodeIntention({...intention,summary:'🧠'.repeat(2000)})).toThrow();
});
test('eligible_intention_is_not_starved_by_sixteen_earlier_waiting_ids',()=>{
 const waiting=Array.from({length:16},(_,i)=>item('a'+String(i).padStart(2,'0'),{summary:'Wait for a later time',cue:{kind:'at-or-after',instant:'2026-10-12T02:00:00Z'}}));
 const items=[...waiting,item('z17')],before=structuredClone(items),observation={now:'2026-10-11T02:00:00Z',eventKeys:[]};
 const result=evaluateIntentions(items,observation,16);
 expect(result.items).toHaveLength(16);
 expect(result.items[0]).toEqual({itemId:'z17',status:'eligible'});
 expect(result.items.slice(1).map(value=>value.itemId)).toEqual(waiting.slice(0,15).map(value=>value.id));
 expect(result).toMatchObject({truncated:true,advisory:true});
 expect(evaluateIntentions([...items].reverse(),observation,16)).toEqual(result);
 expect(items).toEqual(before);
});
