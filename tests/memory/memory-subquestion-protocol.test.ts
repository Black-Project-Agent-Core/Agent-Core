import {readFile} from 'node:fs/promises';
import {describe,expect,it,vi} from 'vitest';
import {controllerLearning} from '../../src/mcp/controller-learning-schemas.js';
import {registerControllerLearningTools} from '../../src/mcp/controller-learning-tools.js';

describe('current documented bounded controller protocol',()=>{
 it('parses and dispatches the maintained context example through the actual registration',async()=>{
  const document=await readFile(new URL('../../docs/memory/WORKFLOW.md',import.meta.url),'utf8');
  const examples=[...document.matchAll(/<!-- controller-tool-example -->\s*```json\s*([\s\S]*?)```/g)].map(match=>JSON.parse(match[1]));
  expect(examples).toHaveLength(1);
  const context=vi.fn(async()=>({status:'available',advisory:true}));let registered:any;
  registerControllerLearningTools({registerTool:(_name:string,metadata:any,call:any)=>{registered={schema:metadata.inputSchema,call};}} as any,{context,workflowNext:async()=>({advisory:true})} as any,'synthetic-doc-session');
  for(const example of examples){
   expect(example.taskId).toBe('<returned-task-id>');example.taskId='synthetic-host-returned-task';
   const args=registered.schema.parse(example);const output=await registered.call(args);
   expect(output.isError,JSON.stringify(output)).not.toBe(true);
   expect(context).toHaveBeenCalledWith('synthetic-doc-session',expect.objectContaining({taskId:example.taskId,query:example.query,retrievalPlan:example.retrievalPlan}),undefined,undefined);
   for(const changed of [{taskId:undefined},{query:'mismatched root'},{limit:9},{retrievalPlan:{...example.retrievalPlan,questions:[example.retrievalPlan.questions[0]]}}])
    expect(controllerLearning.safeParse({...example,...changed}).success).toBe(false);
  }
 });
 it('keeps current ownership, bounded disclosure and live evidence limitations explicit',async()=>{
  const document=await readFile(new URL('../../docs/memory/WORKFLOW.md',import.meta.url),'utf8');
  for(const phrase of ['canonical owner','32,768','4,096','15,000','monotonic','networkStopped=false','gap','Learning','never authority','ChatGPT','Claude'])expect(document).toContain(phrase);
  const historical=await readFile(new URL('../../docs/memory/Memory-Subquestion-Retrieval-Protocol.md',import.meta.url),'utf8');
  expect(historical).toContain('Historical document');expect(historical).toContain('CONSOLIDATION.md');
 });
});
