import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect } from 'vitest';
import { initializeMemoryRoot } from '../../../../src/memory/facade.js';
const roots:string[]=[];
export async function setup(active=true,overrides={}) {
  const dir=await mkdtemp(path.join(os.tmpdir(),'memory-t4-'));roots.push(dir);
  const service=await initializeMemoryRoot({baseDir:dir,memoryRoot:dir,...(active?{experience:{enabled:true as const}}:{})});
  const scope={workspaceKey:'agent-core',taskId:'task-race',controllerId:'controller-A',...overrides};
  return {dir,service,scope,A:service.controller(scope),B:service.controller({...scope,controllerId:'controller-B',sessionId:'session-B'})};
}
export async function cleanup(){await Promise.all(roots.splice(0).map(dir=>rm(dir,{recursive:true,force:true})));}
export const start={startKey:'start-capsule',goal:'Preserve the engineering goal',sourceRefs:[]};
export function item(id:string,kind='blocker',text=`Preserve ${id}`,critical=true,sourceRefs:any[]=[]) {
  return {id,kind,text,critical,state:'active',sourceRefs,verification:{status:'unverified',evidence:[]}};
}
export const append=(header:any,operationId:string,items:any[]=[],sourceRefs:any[]=[],summary='Synthetic observation')=>({episodeId:header.id,expectedRevision:header.revision,operationId,event:{kind:'observation',summary,sourceRefs,stateChanges:items.map(item=>({op:'upsert',item}))}});
export const checkpoint=(header:any,operationId='checkpoint-1',maxBytes=8192)=>({episodeId:header.id,expectedRevision:header.revision,operationId,trigger:'explicit',budget:{maxBytes}});
export function bounded(result:any,budget:number){expect(Buffer.byteLength(JSON.stringify(result),'utf8')).toBe(result.metrics.payloadBytes);expect(result.metrics.payloadBytes).toBeLessThanOrEqual(budget);expect(result.metrics.estimatedTokens).toBe(Math.ceil(Array.from(JSON.stringify(result)).length/4));}
export async function expandAll(A:any,source:any,view='episode',budget=8192){let cursor:string|undefined,text='',bytes=0,calls=0;do{const result=await A.expand({source,view,budget:{maxBytes:budget},...(cursor?{cursor}:{})});expect(result.status).not.toBe('insufficient-budget');bounded(result,budget);text+=result.data.text;bytes+=result.metrics.payloadBytes;calls++;cursor=result.data.nextCursor;}while(cursor);return{text,bytes,calls};}
