import type { McpServer } from '@modelcontextprotocol/server';
import { parseToolGrant } from '../auth/tool-grant.js';
import type { ExternalControllerLearningService } from '../learning/external-controller.js';
import { toolCapabilityUse } from '../capability-awareness.js';
import { activityTracker } from '../tracker/activity-tracker.js';
/** Passive presentation observer only. The existing grant/mutation owners still authorize calls. */
export function installCapabilityObservation(server:McpServer,principal:unknown,external?:ExternalControllerLearningService,sessionId?:string):void {
 if(!external || !sessionId)return;
 const grant=principal && typeof principal==='object' && 'toolGrant' in principal
  ? new Set(parseToolGrant((principal as {toolGrant:unknown}).toolGrant).allowedTools):undefined;
 const entries=new Map<string,{enabled?:boolean}>();
 external.attachCapabilityInventory?.(sessionId,()=>[...entries].filter(([name,item])=>(!grant||grant.has(name))&&item.enabled!==false).map(([name])=>name).sort());
 const target=server as any, original=target.registerTool.bind(server);
 target.registerTool=(name:string,config:any,callback:any)=>{
  const registered=original(name,config,async(args:any,ctx:any)=>{
   const result=await callback(args,ctx);
   if(args?.origin==='ui' || result?.isError)return result;
   try {
    if(name==='skills' && ['list','inspect','search','read'].includes(String(args?.action))) {
      const payload=(result?.content??[]).find((part:any)=>part?.type==='text')?.text;
      if(typeof payload==='string')await external.recordInspectedSkillArtifacts?.(sessionId,payload);
    }
    const use=toolCapabilityUse(name,args??{},true,'source:host-capability-observation');
    if(use)await external.recordCapabilityUse?.(sessionId,use);
    const notice=await external.takeCapabilityUsageNotice?.(sessionId);
    if(notice)return {...result,content:[...(Array.isArray(result?.content)?result.content:[]),{type:'text',text:notice}]};
   }catch(error){activityTracker.captureFailure('LEARNING',error,'external-capability-notice-unavailable');}
   return result;
  });
  entries.set(name,registered);
  return registered;
 };
}
