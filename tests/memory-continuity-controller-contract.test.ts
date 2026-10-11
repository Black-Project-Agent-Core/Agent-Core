import {afterEach,expect,test} from 'vitest';
import {readFile} from 'node:fs/promises';
import {registerMemoryExperienceTools} from '../src/mcp/memory-experience-tools.js';
import {setup,cleanup,start,checkpoint} from '../SubProject/agent-core-memory/tests/helpers/memory-capsule.js';
afterEach(cleanup);
test('host facade preserves exact continuity, warnings and episode handle without attribution or auto-resume',async()=>{
 const {A,scope}=await setup();const h=await A.startEpisode(start);const paused=await A.setEpisodeStatus({episodeId:h.id,expectedRevision:1,operationId:'pause-controller',status:'paused',reason:'User asked to stop',sourceRefs:[]});await A.checkpoint(checkpoint(paused));
 const callbacks=new Map<string,any>();const metadata=new Map<string,any>();const server={registerTool(name:string,meta:any,fn:any){callbacks.set(name,fn);metadata.set(name,meta);}};
 registerMemoryExperienceTools(server as any,{controller:()=>A} as any,async()=>scope);
 expect(metadata.get('memory_v2_read').description).toContain('continuity');
 const before=await A.getTaskContext({budget:{maxBytes:7808}});const response=await callbacks.get('memory_v2_read')({action:'task_context',scope:{taskId:scope.taskId}});expect(response.isError).not.toBe(true);
 const body=JSON.parse(response.content[0].text);expect(body.result).toEqual(before);expect(body.result.data.continuity.status).toBe('ready');expect(body.result.data.episode.status).toBe('paused');expect(body.advisory).toBe(true);expect(body.result.warnings).toContain('memory-is-advisory');
 for(const claim of ['delivered','used','verified'])expect(body.result.data).not.toHaveProperty(claim);
 expect(await A.getTaskContext({budget:{maxBytes:7808}})).toEqual(before);
});
test('both controller instructions make continuity advisory and user stop authoritative',async()=>{
 const docs=await readFile('SubProject/agent-core-memory/docs/controller-integration.md','utf8');expect(docs).toContain('revalidate-required');expect(docs).toContain('paused');expect(docs).toContain('completion');
});
