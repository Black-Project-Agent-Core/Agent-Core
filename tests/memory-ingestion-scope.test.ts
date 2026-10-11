import {afterEach,expect,test} from 'vitest';
import {registerMemoryExperienceTools} from '../src/mcp/memory-experience-tools.js';
import {MemoryControllerError,disclosureDigest} from '../SubProject/agent-core-memory/src/memory/disclosure.js';
import {setup,cleanup,start,append} from '../SubProject/agent-core-memory/tests/helpers/memory-capsule.js';
afterEach(cleanup);
test('ingestion cursor facade enforces trusted scope and strict identities with no cursor mutation',async()=>{
 const {A,scope}=await setup();const h=await A.startEpisode(start),callbacks=new Map<string,any>();let engineCalls=0;
 const server={registerTool(name:string,_meta:any,fn:any){callbacks.set(name,fn);}};
 registerMemoryExperienceTools(server as any,{controller:()=>{engineCalls++;return A;}} as any,async selector=>{if(selector?.taskId!==scope.taskId)throw new MemoryControllerError('MEMORY_SCOPE_MISMATCH');return scope;});
 const call=async(action:string,payload:any={},taskId=scope.taskId,write=false)=>{const r=await callbacks.get(write?'memory_v2_write':'memory_v2_read')({action,scope:{taskId},payload});return {raw:r,value:JSON.parse(r.content[0].text)};};
 const empty=await call('ingestion_cursor',{streamId:'explicit-stream'});expect(empty.raw.isError).not.toBe(true);expect(empty.value.result).toEqual({sequence:0});
 const beforeCalls=engineCalls;expect((await call('ingestion_cursor',{streamId:'explicit-stream'},'foreign-task')).value.code).toBe('MEMORY_SCOPE_MISMATCH');expect(engineCalls).toBe(beforeCalls);
 expect((await call('ingestion_cursor',{streamId:'bad\nstream'})).value.code).toBe('MEMORY_INPUT_INVALID');expect((await call('ingestion_cursor',{streamId:'explicit-stream',taskId:'foreign'})).value.code).toBe('MEMORY_INPUT_INVALID');
 const captured=await A.captureEvidence({operationId:'mcp-capture',source:{kind:'controller-text',text:'Explicit source'}});const request={...append(h,'mcp-ingest',[],[captured.source]),ingestion:{streamId:'explicit-stream',batchId:'batch-one',sequence:1,sourceDigest:disclosureDigest(['Explicit source'])}};
 const accepted=await call('event_append',request,scope.taskId,true);expect(accepted.raw.isError).not.toBe(true);expect(accepted.value.result.ingestionReceipt.sequence).toBe(1);
 expect((await call('event_append',{...request,ingestion:{...request.ingestion,batchId:'different'}},scope.taskId,true)).value.code).toBe('MEMORY_OPERATION_CONFLICT');expect((await call('ingestion_cursor',{streamId:'explicit-stream'})).value.result).toEqual({sequence:1,receipt:accepted.value.result.eventRef});
});
