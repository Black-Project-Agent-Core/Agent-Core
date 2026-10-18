import type {McpServer} from '@modelcontextprotocol/server';
import {toolInputSchema} from '../harness/reconstruction/contracts.js';
import {evaluateReconstructionHarness} from '../harness/reconstruction/service.js';
import {currentToolInvocationRequest} from '../tracker/tool-invocation.js';

/** Native-only first wave: public remote registration awaits full manifest budget. */
export function registerReconstructionHarnessTool(
  server:McpServer,host:{taskId:string;workspace:string},
):void{
  server.registerTool('reconstruction_harness',{
    title:'Reconstruction Evidence Harness',
    description:'Native-only, read-only proof-obligation assessment against host-owned tool terminal receipts. '+
      'No target execution, memory writes or automatic approval. Tool completion is NOT goal correctness.',
    inputSchema:toolInputSchema,
    annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true},
  },async(args,ctx)=>{
    try{
      const request=currentToolInvocationRequest();
      if(!request||request.tool!=='reconstruction_harness'
        ||!host.taskId||!host.workspace
        ||request.mutationContext.taskId!==host.taskId
        ||request.mutationContext.signal?.aborted)throw new Error('HARNESS_HOST_SCOPE_UNAVAILABLE');
      const input=toolInputSchema.parse(args);
      const result=await evaluateReconstructionHarness(input.action,input.manifest,{
        taskId:host.taskId,workspace:host.workspace,origin:'native',
        processSessionId:request.identity.processSessionId,
      },{signal:ctx?.mcpReq?.signal});
      return {content:[{type:'text' as const,text:JSON.stringify(result)}]};
    }catch(error){
      const code=error instanceof Error&&/^HARNESS_[A-Z_]+$/.test(error.message)
        ?error.message:'HARNESS_INPUT_OR_EVIDENCE_UNAVAILABLE';
      return {content:[{type:'text' as const,text:code}],isError:true};
    }
  });
}