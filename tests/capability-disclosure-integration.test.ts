import { describe, expect, it } from 'vitest';
import { fixture } from './skill-proposal-fixture.js';
import { AgentRuntimeService } from '../src/agent-runtime.js';
import { ExternalControllerLearningService } from '../src/learning/external-controller.js';
import { toolCapabilityUse } from '../src/capability-awareness.js';
import path from 'node:path';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { createAgentCoreMcpServer } from '../src/mcp/server.js';
import { attachControllerContract } from './controller-contract-fixture.js';
import { createToolInvocationIdentity } from '../src/tracker/tool-invocation.js';
const use=()=>toolCapabilityUse('code_graph',{},true,'tool:observed-call')!;
const ownerId = 'capability-fixture-owner';
const binding = (f: Awaited<ReturnType<typeof fixture>>) => ({ ownerId, workspaceIdentityKey: f.memory.registeredWorkspaceIdentity('agent-core').key });
async function capture(e: ExternalControllerLearningService, sessionId: string) {
 const identity = createToolInvocationIdentity();
 const context = await e.captureToolInvocationContext({ ...identity, invocationId: identity.id, sessionId, ownerId });
 expect(context.binding).toBe('bound'); return context;
}
describe('Native and external usage delivery',()=>{
 it('persists Native usage/inclusion without claiming delivery; repeated render is idempotent',async()=>{
  const f=await fixture(); const r:any=await AgentRuntimeService.initialize(f.root,f.learning,undefined,f.memory);
  expect(r.recordCapabilityUse).toBeTypeOf('function');
  await r.startSession({sessionId:'s'});await r.beginTask({sessionId:'s',taskId:'t',goal:'Audit dependencies',workspace:'agent-core'});
  expect(await r.appendNativeCapabilityNotice('t','answer')).toBe('answer');
  await r.recordCapabilityUse('t',use());await r.recordCapabilityUse('t',use());
  const text=await r.appendNativeCapabilityNotice('t','answer');
  expect(text).toContain('Aku menggunakan Code Intelligence');
  expect((await r.getTask('t')).capabilityNotice).toBeUndefined();
  await r.recordNativeCapabilityNoticeInclusion('t',text);
  const reopened:any=await AgentRuntimeService.initialize(f.root,f.learning,undefined,f.memory);
  expect((await reopened.getTask('t')).capabilityUses).toHaveLength(1);
  expect((await reopened.getTask('t')).capabilityNotice.delivery).toBe('unconfirmed');
  expect(await reopened.appendNativeCapabilityNotice('t',text)).toBe(text);
 });
 it('external capsules are exact-once per episode across reopen; silent work has no capsule',async()=>{
  const f=await fixture();const input={stateDir:path.join(f.root,'runtime/learning'),memory:f.memory,learning:f.learning,skills:f.skills};
  const e:any=await ExternalControllerLearningService.initialize(input);
  expect(e.recordCapabilityUse).toBeTypeOf('function');
  await e.startEpisode('session',{workspace:'agent-core',taskKey:'first'},binding(f));
  expect(await e.takeCapabilityUsageNotice('session',await capture(e,'session'))).toBe('');
  await e.recordCapabilityUse('session',use(),await capture(e,'session'));
  expect(await e.takeCapabilityUsageNotice('session',await capture(e,'session'))).toContain('CAPABILITY USAGE NOTICE');
  const again:any=await ExternalControllerLearningService.initialize(input);
  expect(await again.takeCapabilityUsageNotice('session',await capture(again,'session'))).toBe('');
  await again.startEpisode('session',{workspace:'agent-core',taskKey:'second'},binding(f));
  await again.recordCapabilityUse('session',use(),await capture(again,'session'));
  expect(await again.takeCapabilityUsageNotice('session',await capture(again,'session'))).toContain('Code Intelligence');
 });
 it('observes real MCP dispatch, respects grants, and exposes a scoped live registry',async()=>{
  const f=await fixture(); const e:any=await ExternalControllerLearningService.initialize({stateDir:path.join(f.root,'runtime/learning'),memory:f.memory,learning:f.learning,skills:f.skills});
  await e.startEpisode('x',{workspace:'agent-core',taskKey:'fixture'},binding(f));
  const server=createAgentCoreMcpServer({id:ownerId,toolGrant:{version:1,allowedTools:['code_graph','get_config']}},{externalControllerLearning:e,controllerSessionId:'x',skillsService:f.skills});
  server.registerTool('code_graph',{inputSchema:{}},async()=>({content:[{type:'text',text:'graph observation'}]}));
  const client=new Client({name:'capability-test',version:'1'});const [ct,st]=InMemoryTransport.createLinkedPair();
  try{await server.connect(st);await client.connect(ct);await attachControllerContract(client);
   const c:any=await e.context('x',{workspace:'agent-core',query:'dependencies'});
   expect(c.synthesis.capabilityExposure?.tools.count).toBe(2);
   const silent=await client.callTool({name:'get_config',arguments:{}});
   expect(JSON.stringify(silent)).not.toContain('CAPABILITY USAGE NOTICE');
   const first=await client.callTool({name:'code_graph',arguments:{}});
   expect(JSON.stringify(first)).toContain('CAPABILITY USAGE NOTICE');
   const next=await client.callTool({name:'code_graph',arguments:{}});
   expect(JSON.stringify(next)).not.toContain('CAPABILITY USAGE NOTICE');
   const denied=await client.callTool({name:'kill_process',arguments:{pid:1}}).catch(()=>null);
   expect(JSON.stringify(denied)).not.toContain('CAPABILITY USAGE NOTICE');
  }finally{await client.close();await server.close();}
 });
});

it('external inspect delivers an unranked Skill; only an applied receipt emits a notice, even without benefit verification',async()=>{
 const f=await fixture();const {mkdir,writeFile}=await import('node:fs/promises');const dir=path.join(f.root,'unranked');await mkdir(dir);
 await writeFile(path.join(dir,'SKILL.md'),'---\nname: spectral-helper\ndescription: Spectral reasoning recipe\nallowed-tools: ["get_config"]\n---\n\n# Recipe\nInspect configuration.\n');
 const skill=await f.skills.import(dir);
 const e=await ExternalControllerLearningService.initialize({stateDir:path.join(f.root,'runtime/learning'),memory:f.memory,learning:f.learning,skills:f.skills});
 const episode=await e.startEpisode('late',{workspace:'agent-core',taskKey:'unranked'},binding(f));
 const server=createAgentCoreMcpServer({id:ownerId},{externalControllerLearning:e,controllerSessionId:'late',skillsService:f.skills});
 const client=new Client({name:'late-discovery-test',version:'1'});const [ct,st]=InMemoryTransport.createLinkedPair();
 try{await server.connect(st);await client.connect(ct);await attachControllerContract(client);
  await e.context('late',{workspace:'agent-core',query:'Explain anomaly'});
  const inspected=await client.callTool({name:'skills',arguments:{action:'inspect',name:skill.name}});
  expect(JSON.stringify(inspected)).not.toContain('CAPABILITY USAGE NOTICE');
  expect((await e.getEpisode('late'))?.deliveredArtifacts?.['skill:'+skill.name]).toBe(skill.digest);
  const receipt=await e.artifactReceipt('late',{taskId:episode.id,kind:'skill',artifactId:skill.name,contentDigest:skill.digest,applicability:'applied',result:'unavailable',reasonCode:'inspected-recipe'},await capture(e,'late'));
  expect(receipt.trustChanged).toBe(false);
  expect(await (e as any).takeCapabilityUsageNotice('late',await capture(e,'late'))).toContain('Skill spectral-helper');
 }finally{await client.close();await server.close();}
});

it('binds an external host observation to its persisted episode event rather than a synthetic tool proof',async()=>{
 const f=await fixture();const e:any=await ExternalControllerLearningService.initialize({stateDir:path.join(f.root,'runtime/learning'),memory:f.memory,learning:f.learning,skills:f.skills});
 await e.startEpisode('observed',{workspace:'agent-core',taskKey:'observed'},binding(f));
 await e.recordCapabilityUse('observed',use(),await capture(e,'observed'));const episode=await e.getEpisode('observed');
 const recorded=episode.capabilityUses[0];
 expect(recorded.evidenceRef).toContain('source:external-episode:'+episode.id+'#');
 const id=recorded.evidenceRef.split('#')[1];expect(episode.events.some((event:any)=>event.id===id)).toBe(true);
});
