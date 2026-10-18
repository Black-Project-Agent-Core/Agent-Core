import { expect, it } from 'vitest';
import { beginToolInvocationEvidence } from '../src/tracker/tool-invocation.js';
import { activityTracker } from '../src/tracker/activity-tracker.js';
import { createAgentCoreMcpServer } from '../src/mcp/server.js';
import { toolHistory } from '../src/rdc/utils/toolHistory.js';
import { usageTracker } from '../src/rdc/utils/usageTracker.js';
import { acknowledgeControllerContract } from './controller-contract-fixture.js';

class FakeTracker {
  events:any[]=[]; failWrites=false;
  record(module:string,level:string,message:string,kind:string,context?:Record<string,unknown>){
    if(this.failWrites) throw new Error('tracker unavailable');
    this.events.push({module,level,message,kind,context}); return this.events.at(-1);
  }
  captureFailure(module:string,error:unknown,kind:string,context?:Record<string,unknown>){
    if(this.failWrites) throw new Error('tracker unavailable');
    this.events.push({module,level:'error',message:String((error as Error)?.message??error),kind,context}); return this.events.at(-1);
  }
}

it('correlates start and exactly one successful terminal event',()=>{
  const tracker=new FakeTracker();
  const invocation=beginToolInvocationEvidence(tracker as any,'read_file');
  expect(invocation.finish('success',{argumentKeys:['path']})).toBe(true);
  expect(invocation.finish('success')).toBe(false);
  expect(tracker.events).toHaveLength(2);
  expect(tracker.events[0]).toMatchObject({kind:'tool-invocation-start',context:{tool:'read_file',invocationId:invocation.id,processSessionId:invocation.processSessionId}});
  expect(tracker.events[1]).toMatchObject({kind:'tool-call',context:{tool:'read_file',invocationId:invocation.id,processSessionId:invocation.processSessionId,outcome:'success'}});
});
it('preserves handled-failure and exception outcomes without blocking on tracker failure',()=>{
  const tracker=new FakeTracker();
  const handled=beginToolInvocationEvidence(tracker as any,'write_file');
  handled.finish('handled-failure',{argumentKeys:['path']});
  const exploded=beginToolInvocationEvidence(tracker as any,'start_process');
  exploded.fail(new Error('boom'),{argumentKeys:['command']});
  expect(tracker.events.find(e=>e.context?.invocationId===handled.id&&e.kind==='handled-tool-failure')?.context.outcome).toBe('handled-failure');
  expect(tracker.events.find(e=>e.context?.invocationId===exploded.id&&e.kind==='tool-exception')?.context.outcome).toBe('exception');
  const broken=new FakeTracker(); broken.failWrites=true;
  const nonblocking=beginToolInvocationEvidence(broken as any,'read_file');
  expect(()=>nonblocking.finish('success')).not.toThrow();
});

it('gives concurrent identical calls distinct invocation ids',()=>{
  const tracker=new FakeTracker();
  const a=beginToolInvocationEvidence(tracker as any,'read_file');
  const b=beginToolInvocationEvidence(tracker as any,'read_file');
  expect(a.id).not.toBe(b.id);
  expect(a.processSessionId).toBe(b.processSessionId);
});
it('correlates the actual machine-control wrapper without persisting tracker/history state',async()=>{
  const events:any[]=[];
  const originalRecord=activityTracker.record, originalCapture=activityTracker.captureFailure;
  const originalAdd=(toolHistory as any).addCall, originalSuccess=(usageTracker as any).trackSuccess, originalFailure=(usageTracker as any).trackFailure;
  (activityTracker as any).record=(module:string,level:string,message:string,kind:string,context?:Record<string,unknown>)=>{events.push({module,level,message,kind,context});return events.at(-1);};
  (activityTracker as any).captureFailure=(module:string,error:unknown,kind:string,context?:Record<string,unknown>)=>{events.push({module,level:'error',message:String(error),kind,context});return events.at(-1);};
  (toolHistory as any).addCall=()=>undefined;
  (usageTracker as any).trackSuccess=async()=>undefined;
  (usageTracker as any).trackFailure=async()=>undefined;
  try{
    const server=createAgentCoreMcpServer();
    const contractSession=await acknowledgeControllerContract((name,args)=>(server as any)._registeredTools[name].executor(args,{}));
    const tool=(server as any)._registeredTools?.get_config;
    expect(tool?.executor).toBeTypeOf('function');
    const result=await tool.executor({origin:'llm',contractSession},{});
    expect(result?.isError).not.toBe(true);
    const boundaries=events.filter(e=>e.kind==='tool-invocation-start'||e.kind==='tool-call');
    expect(boundaries).toHaveLength(2);
    expect(boundaries[0].context.invocationId).toBe(boundaries[1].context.invocationId);
    expect(boundaries[0].context.processSessionId).toBe(boundaries[1].context.processSessionId);
    expect(boundaries[1].context.outcome).toBe('success');
  }finally{
    (activityTracker as any).record=originalRecord;(activityTracker as any).captureFailure=originalCapture;
    (toolHistory as any).addCall=originalAdd;(usageTracker as any).trackSuccess=originalSuccess;(usageTracker as any).trackFailure=originalFailure;
  }
});
