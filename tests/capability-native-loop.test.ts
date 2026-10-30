import { afterEach, expect, it, vi } from 'vitest';
import { fixture } from './skill-proposal-fixture.js';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { AgentRuntimeService } from '../src/agent-runtime.js';
import { NativeAgentController } from '../src/agent-controller.js';
import { AgentChatService } from '../src/agent-chat-service.js';
import { activityTracker } from '../src/tracker/activity-tracker.js';
import { skillInstructionsRead, skillReadCoverageFromMessages, skillReferenceRead } from '../src/capability-awareness.js';
import type { AgentModelMessage } from '../src/agent-provider.js';
Object.assign(activityTracker,{readToolInvocationEvents:()=>[]});
afterEach(()=>vi.unstubAllGlobals());
it('requires a full Skill read before Native use and persists one notice across replay',async()=>{
 const f=await fixture();const dir=path.join(f.root,'fixture-skill');await mkdir(dir);
 await writeFile(path.join(dir,'SKILL.md'),'---\nname: activation-audit\ndescription: Audit installation hashes and integrity\nallowed-tools: ["get_config"]\n---\n\n# Audit\nRead configuration before conclusions.\n');
 const skill=await f.skills.import(dir);const requests:any[]=[];let turn=0;
 const indexDir=path.join(f.root,'index');await mkdir(indexDir);
 await writeFile(path.join(indexDir,'SKILL.md'),'---\nname: agent-core-capability-index\ndescription: Unranked routes\n---\nPRIVATE-CHILD-INSTRUCTIONS\n');
 const index=await f.skills.import(indexDir);
 const choice=(name:string,args:any)=>({choices:[{finish_reason:'tool_calls',message:{content:null,tool_calls:[{id:'c'+turn,type:'function',function:{name,arguments:JSON.stringify(args)}}]}}]});
 vi.stubGlobal('fetch',vi.fn(async(_u:any,init:any)=>{const body=JSON.parse(init.body);requests.push(body);turn++;
  const strategy={strategy:'Use the relevant audit recipe',hypothesis:'Configuration identifies installed state',expectedObservation:'Configuration is available',artifactUse:[{kind:'skill',artifactId:skill.name,contentDigest:skill.digest,applicability:'applied',reasonCode:'relevant-installation-audit'}]};
  if(turn===2)expect(JSON.stringify(body.messages)).toContain('skill-instructions-not-fully-read');
  const result=turn===1||turn===3?choice('agent_core_strategy',strategy):turn===2?choice('skills',{action:'read',name:skill.name,expectedActiveDigest:skill.digest}):turn===4?choice('get_config',{}):choice('agent_core_finalize',{outcome:'verified',reason:'task-complete',verificationRef:'tool:config-fixture',finalResponse:'Configuration inspected.',nothingWorthSaving:true});
  return new Response(JSON.stringify(result),{status:200,headers:{'content-type':'application/json'}});
 }));
 const config={enabled:true,baseUrl:'http://127.0.0.1:9999/v1',model:'fixture-model',apiKey:null,requestTimeoutMs:5000,maxToolIterations:6,allowedTools:['get_config','skills']};
 const runtime=await AgentRuntimeService.initialize(f.root,f.learning,config,f.memory);
 const controller=new NativeAgentController(runtime,{memoryService:f.memory,learningService:f.learning,skillsService:f.skills},config);
 const chat=await AgentChatService.initialize(f.root,runtime,controller);const c=await chat.createConversation({workspace:'agent-core'});
 const input={conversationId:c.conversation.id,clientRequestId:'capability-loop',prompt:'Audit installation hashes and integrity. Read only.'};
 const result=await chat.runTurn(input);
 expect(JSON.stringify(requests[0].messages)).toContain('activation-audit');
 expect(requests[0].messages.find((m:any)=>m.content?.includes('NATIVE SKILL GUIDANCE'))?.content).toContain(index.digest);
 expect(JSON.stringify(requests[0].messages)).not.toContain('PRIVATE-CHILD-INSTRUCTIONS');
 expect(input.prompt).not.toContain('activation-audit');
 expect(result.response).toContain('Aku menggunakan Skill activation-audit');
 expect(result.response?.match(/Aku menggunakan/g)).toHaveLength(1);
 const task:any=await runtime.getTask(result.taskId);expect(task.capabilityNotice.delivery).toBe('unconfirmed');
 expect(task.artifactUse).toHaveLength(1);
 const replay=await chat.runTurn(input);expect(replay.response).toBe(result.response);expect(requests).toHaveLength(5);
 const messages=chat.getConversation(c.conversation.id)!.messages.filter(m=>m.role==='assistant');expect(messages).toHaveLength(1);
});

it('does not accept inspect-only Native Skill application when initial query had no lexical match',async()=>{
 const f=await fixture();const dir=path.join(f.root,'unranked-skill');await mkdir(dir);
 await writeFile(path.join(dir,'SKILL.md'),'---\nname: spectral-helper\ndescription: Spectral reasoning recipe\nallowed-tools: ["get_config"]\n---\n\n# Recipe\nInspect configuration.\n');
 const skill=await f.skills.import(dir);let turn=0;
 const choice=(name:string,args:any)=>({choices:[{finish_reason:'tool_calls',message:{content:null,tool_calls:[{id:'late'+turn,type:'function',function:{name,arguments:JSON.stringify(args)}}]}}]});
 const strategy={strategy:'Inspect a catalog recipe before applying it',hypothesis:'Recipe may guide the requested explanation',expectedObservation:'The artifact is in the active catalog'};
 vi.stubGlobal('fetch',vi.fn(async()=>{turn++;const result=turn===1?choice('agent_core_strategy',strategy):turn===2?choice('skills',{action:'inspect',name:skill.name}):turn===3?choice('agent_core_strategy',{...strategy,artifactUse:[{kind:'skill',artifactId:skill.name,contentDigest:skill.digest,applicability:'rejected',reasonCode:'unrelated-context'},{kind:'skill',artifactId:skill.name,contentDigest:skill.digest,applicability:'adapted',reasonCode:'inspected-recipe'}]}):choice('agent_core_finalize',{outcome:'verified',reason:'task-complete',verificationRef:'tool:late-inspect',finalResponse:'Explained.',nothingWorthSaving:true});return new Response(JSON.stringify(result),{status:200,headers:{'content-type':'application/json'}});}));
 const config={enabled:true,baseUrl:'http://127.0.0.1:9999/v1',model:'fixture-model',apiKey:null,requestTimeoutMs:5000,maxToolIterations:5,allowedTools:['skills']};
 const runtime=await AgentRuntimeService.initialize(f.root,f.learning,config,f.memory);
 const controller=new NativeAgentController(runtime,{memoryService:f.memory,learningService:f.learning,skillsService:f.skills},config);
 const result=await controller.runTask({prompt:'Explain this anomaly',workspace:'agent-core'});
 expect(result.response).not.toContain('Skill spectral-helper');
 expect((await runtime.getTask(result.taskId))?.artifactUse).toMatchObject([{applicability:'rejected'}]);
});

it('keeps Native main-body Skill admission closed after reference-only delivery',async()=>{
 const f=await fixture(),dir=path.join(f.root,'native-reference');await mkdir(dir);
 await mkdir(path.join(dir,'references'));
 await writeFile(path.join(dir,'SKILL.md'),'---\nname: source-review\ndescription: Inspect exact source evidence\n---\nRead the primary body.\n');
 await writeFile(path.join(dir,'references','appraisal.md'),'A separate evidence reference.\n');
 const skill=await f.skills.import(dir);let turn=0;const requests:any[]=[];
 const read=(resourcePath?:string)=>({action:'read',name:skill.name,expectedActiveDigest:skill.digest,
  ...(resourcePath?{resourcePath}:{})});
 const artifact={kind:'skill',artifactId:skill.name,contentDigest:skill.digest,
  applicability:'applied',reasonCode:'review-evidence'};
 const strategy=(uses:any[]=[])=>({strategy:'Review the available source evidence',
  hypothesis:'Skill instructions may support the conclusion',
  expectedObservation:'The appropriate Skill content is delivered',artifactUse:uses});
 const choice=(name:string,args:any)=>({choices:[{finish_reason:'tool_calls',message:{
  content:null,tool_calls:[{id:'n'+turn,type:'function',function:{name,arguments:JSON.stringify(args)}}]}}]});
 vi.stubGlobal('fetch',vi.fn(async(_url:any,init:any)=>{
  const body=JSON.parse(init.body);requests.push(body);turn++;
  const result=turn===1?choice('agent_core_strategy',strategy()):
   turn===2?choice('skills',read('references/appraisal.md')):
   turn===3?choice('agent_core_strategy',strategy([artifact])):
   turn===4?choice('skills',read()):
   turn===5?choice('agent_core_strategy',strategy([artifact])):
   choice('agent_core_finalize',{outcome:'verified',reason:'task-complete',
    verificationRef:'tool:source-review',finalResponse:'Review complete.',nothingWorthSaving:true});
  return new Response(JSON.stringify(result),{status:200,headers:{'content-type':'application/json'}});
 }));
 const config={enabled:true,baseUrl:'http://127.0.0.1:9999/v1',model:'fixture-model',
  apiKey:null,requestTimeoutMs:5000,maxToolIterations:8,allowedTools:['skills']};
 const runtime=await AgentRuntimeService.initialize(f.root,f.learning,config,f.memory);
 const controller=new NativeAgentController(runtime,{memoryService:f.memory,
  learningService:f.learning,skillsService:f.skills},config);
 const result=await controller.runTask({prompt:'Review source evidence with source-review',workspace:'agent-core'});
 expect(JSON.stringify(requests[3].messages)).toContain('skill-instructions-not-fully-read');
 const task:any=await runtime.getTask(result.taskId);
 expect(task?.artifactUse).toHaveLength(1);
 expect(result.response).toContain('Aku menggunakan Skill source-review');
 const resumed=skillReadCoverageFromMessages(requests[5].messages as AgentModelMessage[]);
 expect(skillReferenceRead(resumed,skill.name,'references/appraisal.md',skill.digest)).toBe(true);
 expect(skillInstructionsRead(resumed,skill.name,skill.digest)).toBe(true);
});
