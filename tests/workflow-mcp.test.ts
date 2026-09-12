import { createServer, type Server } from 'node:http';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { FileKeyStore } from '../src/auth/key-store.js';
import { loadConfig } from '../src/config.js';
import { createHttpHandler } from '../src/http/app.js';
import { createMcpHttpHandler } from '../src/mcp/handler.js';
import { FileAuditLogger } from '../src/logging/audit-log.js';
import type { RuntimeServices } from '../src/runtime/services.js';
import { createIsolatedRuntimeServices, isolatedMemoryDependencies, strictMemoryConfig } from './helpers/memory-fixture.js';
import { nodeShellCommand } from './helpers/platform-command.js';
import { assessPlan, acceptCurrentReview } from './helpers/engineering.js';
import { workflowScope } from '../src/mcp/workflow-guard.js';
import type { WorkflowPlanInput } from '../src/workflow/types.js';

const initialCode='export async function retry<T>(action: () => Promise<T>, attempts: number): Promise<T> { return action(); }\n';
const nativeCode='export async function retry<T>(action: () => Promise<T>, attempts: number): Promise<T> { for (let attempt = 0; ; attempt++) { try { return await action(); } catch (error) { if (attempt + 1 >= attempts) throw error; } } }\n';
const fixtures:Array<{root:string;runtime:RuntimeServices;server:Server;audit:FileAuditLogger}>=[];
async function fixture(sharedMemoryPrincipal=true){
  const root=await mkdtemp(path.join(tmpdir(),'ac-workflow-mcp-')), donor=path.join(root,'referensi','retry'),target=path.join(root,'src','retry.ts');
  await mkdir(donor,{recursive:true});await mkdir(path.dirname(target),{recursive:true});await mkdir(path.join(root,'reports'),{recursive:true});
  await writeFile(path.join(donor,'retry.py'),'def retry(action, attempts):\n    for attempt in range(attempts):\n        try: return action()\n        except Exception:\n            if attempt + 1 == attempts: raise\n');
  await writeFile(path.join(donor,'README.md'),'# Retry\nRetries a callback up to a bound.\n');await writeFile(target,initialCode);
  const memory=await strictMemoryConfig(root,{AGENT_CORE_MEMORY_PRINCIPAL_ID:sharedMemoryPrincipal?'workflow-test-principal':undefined}),dependencies=isolatedMemoryDependencies(memory);
  const defaults=loadConfig({},root);
  const runtime=createIsolatedRuntimeServices([root],path.join(root,'capabilities'),undefined,memory,{...defaults.execution,enabled:true,maxConcurrency:2,resourceGovernance:{...defaults.execution.resourceGovernance,enabled:false}},undefined,undefined,undefined,undefined,undefined,undefined,undefined,dependencies);
  await runtime.execution.open();
  const keyStore=new FileKeyStore(path.join(root,'data')),principal=await keyStore.create('workflow-mcp');
  const audit=new FileAuditLogger(path.join(root,'logs'));
  const server=createServer(createHttpHandler({keyStore,auditLogger:audit,mcpHandler:createMcpHttpHandler(runtime)}));
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));fixtures.push({root,runtime,server,audit});
  const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  async function call(name:string,args:Record<string,unknown>={},apiKey=principal.key){
    const response=await fetch(base+'/mcp',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})});
    const raw=await response.json() as any;let value:any;try{value=JSON.parse(raw.result?.content?.[0]?.text??'{}');}catch{value=raw;}
    return{raw,value,error:raw.result?.isError===true||Boolean(raw.error)};
  }
  return{root,donor,target,runtime,principal,keyStore,dependencies,call};
}
function ok(result:{error:boolean;value:any;raw:any}){expect(result.error,JSON.stringify(result.value)).toBe(false);return result.value;}
function code(result:{error:boolean;value:any},expected:string){expect(result.error,JSON.stringify(result.value)).toBe(true);expect(result.value.error?.code??result.value.error).toEqual(expected);}
function fixtureScope(f:Awaited<ReturnType<typeof fixture>>,route:any,principalId=f.principal.metadata.id){return workflowScope(f.runtime,f.runtime.memory.config.principalId??principalId,f.root,route.continuityTaskId);}
async function routed(f:Awaited<ReturnType<typeof fixture>>){
  return ok(await f.call('capability_route',{task:'Implement retry from donor Python code and integrate a native TypeScript endpoint',projectRoot:f.root,workflow:'direct',craft:{requirements:[{id:'bounded-retry',description:'Retry callback up to the limit and propagate final failure'}],donors:[{id:'retry-donor',source:f.donor}]}}));
}
function checks(f:Awaited<ReturnType<typeof fixture>>){
  const unitReport=path.join(f.root,'reports','unit.json'),integrationReport=path.join(f.root,'reports','integration.json');
  const unitCommand=nodeShellCommand(`(async()=>{const assert=require('node:assert/strict');const fs=require('node:fs');const {retry}=await import(require('node:url').pathToFileURL(${JSON.stringify(f.target)}).href);let calls=0;assert.equal(await retry(async()=>{if(++calls<3)throw Error('transient');return 'OK';},3),'OK');assert.equal(calls,3);let failures=0;await assert.rejects(retry(async()=>{failures++;throw Error('final');},2),/final/);assert.equal(failures,2);fs.writeFileSync(${JSON.stringify(unitReport)},JSON.stringify({passed:true,calls,failures}));})().catch(e=>{console.error(e);process.exitCode=1;});`);
  const integrationCommand=nodeShellCommand(`(async()=>{const assert=require('node:assert/strict');const fs=require('node:fs');const {retry}=await import(require('node:url').pathToFileURL(${JSON.stringify(f.target)}).href);const server=require('node:http').createServer(async(req,res)=>{let attempts=0;try{const value=await retry(async()=>{if(++attempts<2)throw Error('transient');return 'READY';},2);res.end(value);}catch(e){res.statusCode=500;res.end(String(e));}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const endpoint='http://127.0.0.1:'+server.address().port;try{const response=await fetch(endpoint);assert.equal(response.status,200);assert.equal(await response.text(),'READY');}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}assert.equal(server.listening,false);await assert.rejects(fetch(endpoint));fs.writeFileSync(${JSON.stringify(integrationReport)},JSON.stringify({passed:true,endpoint:'loopback',serverStopped:true}));})().catch(e=>{console.error(e);process.exitCode=1;});`);
  return{unitReport,integrationReport,unitCommand,integrationCommand};
}
async function planned(f:Awaited<ReturnType<typeof fixture>>,route:any,donorFile='retry.py',commandImplementation=false){
  const donor=ok(await f.call('craft_source',{routeContextId:route.routeContextId,operation:'read',role:'donor',donorId:'retry-donor',path:donorFile}));
  const target=ok(await f.call('craft_source',{routeContextId:route.routeContextId,operation:'read',role:'target',path:f.target}));
  const status=ok(await f.call('workflow_status',{routeContextId:route.routeContextId}));
  const c=checks(f),record=status.contract??status;
  const mutationCommand=commandImplementation?nodeShellCommand(`require('node:fs').writeFileSync(${JSON.stringify(f.target)},${JSON.stringify(nativeCode)});`):undefined;
  const input={expectedVersion:record.version,steps:[{id:'adapt-retry',purpose:'Adapt donor retry loop into native target',kind:commandImplementation?'command':'edit',paths:[f.target],...(mutationCommand?{command:mutationCommand}:{})},{id:'unit',purpose:'Verify bound and final error',kind:'verification',command:c.unitCommand,paths:[]},{id:'integration',purpose:'Verify through running HTTP entrypoint',kind:'verification',command:c.integrationCommand,paths:[]}],mappings:[{requirementId:'bounded-retry',donorId:'retry-donor',donorReceiptIds:[donor.receipt.id],targetReceiptIds:[target.receipt.id],mechanism:'Bounded retry loop with final error propagation',inputs:'Async callback and maximum attempts',outputs:'Successful callback value or final error',dependencies:'Existing native async callback seam',failureBehavior:'Stop and propagate last failure at attempt limit',reuse:'Keep the TypeScript module and callable interface',adaptation:'Translate synchronous Python loop into native async TypeScript loop',rejected:'No Python runtime or external retry package',targetPaths:[f.target],stepIds:['adapt-retry'],license:{mode:'adapt_mechanism',receiptIds:[]}}],checks:[{id:'retry-behavior',purpose:'Bounded attempts and final error',kind:'behavior',requirementIds:['bounded-retry'],stepIds:['unit'],artifactPaths:[c.unitReport]},{id:'http-integration',purpose:'Public target entrypoint with real loopback server',kind:'integration',requirementIds:['bounded-retry'],stepIds:['integration'],artifactPaths:[c.integrationReport]}]};
  await assessPlan(f.runtime.workflow,fixtureScope(f,route),input as WorkflowPlanInput);
  return{...c,input,mutationCommand,source:donor,accept:await f.call('workflow_plan',{routeContextId:route.routeContextId,plan:input})};
}
async function execute(f:Awaited<ReturnType<typeof fixture>>,route:any,p:Awaited<ReturnType<typeof planned>>){
  const accepted=ok(p.accept),revision=accepted.plan.revision;
  if(!p.mutationCommand)ok(await f.call('write_file',{routeContextId:route.routeContextId,path:f.target,content:nativeCode,stepId:'adapt-retry',planVersion:revision}));
  const dependsOn=p.mutationCommand?['implementation-node']:[];
  const nodes=[...(p.mutationCommand?[{id:'implementation-node',purpose:'Write native mechanism through accepted command',command:p.mutationCommand,cwd:f.root,stepIds:['adapt-retry'],inputs:[f.target],resources:{reads:[f.target],writes:[f.target]},expectedArtifacts:[{path:f.target,kind:'file',hash:'sha256',required:true}]}]:[]),{id:'unit-node',purpose:'Verify bound and final error',command:p.unitCommand,cwd:f.root,stepIds:['unit'],inputs:[f.target],resources:{reads:[f.target],writes:[p.unitReport]},dependsOn,expectedArtifacts:[{path:p.unitReport,kind:'file',hash:'sha256',required:true,artifactType:'test_report'}]},{id:'integration-node',purpose:'Verify live native endpoint and shutdown',command:p.integrationCommand,cwd:f.root,stepIds:['integration'],inputs:[f.target],resources:{reads:[f.target],writes:[p.integrationReport]},dependsOn,expectedArtifacts:[{path:p.integrationReport,kind:'file',hash:'sha256',required:true,artifactType:'test_report'}]}];
  const created=ok(await f.call('execution_create',{routeContextId:route.routeContextId,objective:'Verify native transplanted retry behavior and HTTP entrypoint',maxConcurrency:2,nodes}));
  ok(await f.call('execution_start',{routeContextId:route.routeContextId,runId:created.runId}));
  let status:any;
  for(let attempt=0;attempt<12;attempt++){
    status=ok(await f.call('execution_status',{routeContextId:route.routeContextId,runId:created.runId}));
    if(!['planned','running'].includes(status.state))break;
    ok(await f.call('execution_wait',{routeContextId:route.routeContextId,runId:created.runId,afterSequence:status.lastEventSequence,timeoutMs:1500}));
  }
  expect(status.state,JSON.stringify(status)).toBe('completed');expect(status.evidence.verification).toBe('verified');
  await acceptCurrentReview(f.runtime.workflow,fixtureScope(f,route));
  return{created,status};
}
async function plannedComment(f:Awaited<ReturnType<typeof fixture>>,route:any,principal:Awaited<ReturnType<FileKeyStore['create']>>){
  const record=(await f.runtime.workflow.status(fixtureScope(f,route,principal.metadata.id)))!;
  const plan:WorkflowPlanInput={expectedVersion:record.version,mappings:[],steps:[
    {id:'edit-comment',purpose:'Apply the scoped comment edit',kind:'edit',paths:[f.target]},
    {id:'check-comment',purpose:'Verify that the comment edit preserves parsing',kind:'verification',paths:[],command:nodeShellCommand('process.stdout.write("comment fixture verification")')},
  ],checks:[{id:'comment-integration',purpose:'Validate the existing callable comment seam',kind:'integration',requirementIds:[],stepIds:['check-comment'],artifactPaths:[path.join(f.root,'reports',`comment-${principal.metadata.id}.json`)]}]};
  await assessPlan(f.runtime.workflow,fixtureScope(f,route,principal.metadata.id),plan);
  return ok(await f.call('workflow_plan',{routeContextId:route.routeContextId,plan},principal.key)).plan.revision as number;
}
function completion(route:any,runId:string){return{routeContextId:route.routeContextId,status:'completed',summary:'Native retry implementation and real HTTP entrypoint verified',evidence:[{type:'tool',ref:`execution:${runId}`,result:'Current bounded retry and loopback server checks passed'}],decisions:[{key:'native-retry-contract',value:'The native TypeScript retry loop preserves bounded attempts and propagates final failure without a Python runtime dependency.',reason:'Derived from actual Python source and verified by native behavior and loopback endpoint checks.'}],projectTerminal:true};}
afterEach(async()=>{for(const f of fixtures.splice(0)){f.server.closeAllConnections();await new Promise<void>(resolve=>f.server.close(()=>resolve()));await f.runtime.execution.close();await f.runtime.memory.close();await f.audit.close();await rm(f.root,{recursive:true,force:true});}});

describe('workflow through authenticated MCP and real execution',()=>{
  it('authorizes only guarded execution for an inspection route with a persisted required DAG',async()=>{
    const f=await fixture();await writeFile(f.target,nativeCode);
    const route=ok(await f.call('capability_route',{task:'Inspect the existing task objective and acceptance criteria before continuing its final verification.',projectRoot:f.root,workflow:'dag'}));
    expect(route.workflowContext).toMatchObject({craftRequired:false,planRequired:true,dagRequired:true});
    const c=checks(f);
    const nodes=[{id:'unit',purpose:'Verify existing retry behavior',command:c.unitCommand,cwd:f.root,stepIds:['unit'],inputs:[f.target],resources:{reads:[f.target],writes:[c.unitReport]},expectedArtifacts:[{path:c.unitReport,kind:'file',hash:'sha256',required:true,artifactType:'test_report'}]},{id:'integration',purpose:'Verify existing HTTP integration',command:c.integrationCommand,cwd:f.root,stepIds:['integration'],inputs:[f.target],resources:{reads:[f.target],writes:[c.integrationReport]},expectedArtifacts:[{path:c.integrationReport,kind:'file',hash:'sha256',required:true,artifactType:'test_report'}]}];
    const request={routeContextId:route.routeContextId,objective:'Verify the existing implementation through the accepted DAG',nodes,maxConcurrency:1};
    code(await f.call('execution_create',request),'WORKFLOW_PLAN_REQUIRED');
    expect(await f.runtime.execution.runsForContinuityTask({principalId:f.principal.metadata.id,projectId:f.root},route.continuityTaskId)).toHaveLength(0);
    code(await f.call('execute_command',{routeContextId:route.routeContextId,command:c.unitCommand,cwd:f.root}),'ROUTE_TOOL_NOT_ALLOWED');
    code(await f.call('write_file',{routeContextId:route.routeContextId,path:f.target,content:initialCode}),'ROUTE_TOOL_NOT_ALLOWED');
    expect(await readFile(f.target,'utf8')).toBe(nativeCode);
    ok(await f.call('craft_source',{routeContextId:route.routeContextId,role:'target',operation:'read',path:f.target}));
    const before=ok(await f.call('workflow_status',{routeContextId:route.routeContextId}));
    const plan:WorkflowPlanInput={expectedVersion:before.version,mappings:[],steps:[{id:'unit',purpose:'Verify existing retry behavior',kind:'verification',command:c.unitCommand,paths:[]},{id:'integration',purpose:'Verify existing HTTP integration',kind:'verification',command:c.integrationCommand,paths:[]}],checks:[{id:'unit',purpose:'Bounded retries and final failure',kind:'behavior',requirementIds:[],stepIds:['unit'],artifactPaths:[c.unitReport]},{id:'integration',purpose:'Live existing HTTP entrypoint',kind:'integration',requirementIds:[],stepIds:['integration'],artifactPaths:[c.integrationReport]}]};
    code(await f.call('workflow_plan',{routeContextId:route.routeContextId,plan}),'ENGINEERING_ASSESSMENT_REQUIRED');
    await assessPlan(f.runtime.workflow,fixtureScope(f,route),plan);
    const accepted=ok(await f.call('workflow_plan',{routeContextId:route.routeContextId,plan}));
    code(await f.call('execution_create',{...request,nodes:[{...nodes[0],command:nodeShellCommand('process.stdout.write("unplanned")')},nodes[1]]}),'WORKFLOW_COMMAND_NOT_PLANNED');
    const beforeResume=ok(await f.call('execution_create',request));
    ok(await f.call('execution_cancel',{routeContextId:route.routeContextId,runId:beforeResume.runId}));
    ok(await f.call('task_checkpoint',{routeContextId:route.routeContextId,status:'interrupted',summary:'Verification plan accepted; execution will resume under the same task',decisions:[{key:'verification-plan-bound',value:'The accepted plan verifies existing behavior and HTTP integration.',reason:'Derived from the current target source and accepted plan.'}]}));
    const resumed=ok(await f.call('capability_route',{task:'Inspect the existing verification task',projectRoot:f.root,continuity:{resumeTaskId:route.continuityTaskId}}));
    expect(resumed.continuityTaskId).toBe(route.continuityTaskId);
    expect(resumed).toMatchObject({tier:'structured',mode:'capability_guided',verification:{required:true}});
    expect(resumed.reasonCodes).toContain('required_workflow_dag');expect(resumed.reasonCodes).not.toContain('atomic_direct');
    expect(resumed.workflowContext).toMatchObject({craftRequired:false,dagRequired:true,plan:{hash:accepted.plan.hash,revision:accepted.plan.revision}});
    expect(resumed.allowedTools).toEqual(expect.arrayContaining(['execution_create','execution_start','execution_add_nodes','execution_retry','execution_cancel']));
    for(const tool of ['execute_command','start_process','write_file','edit_file'])expect(resumed.allowedTools).not.toContain(tool);
    const other=await f.keyStore.create('different-route-owner');
    code(await f.call('execution_create',{...request,routeContextId:resumed.routeContextId},other.key),'ROUTE_PRINCIPAL_MISMATCH');
    const created=ok(await f.call('execution_create',{...request,routeContextId:resumed.routeContextId}));
    ok(await f.call('execution_start',{routeContextId:resumed.routeContextId,runId:created.runId}));
    let status:any;
    for(let attempt=0;attempt<12;attempt++){
      status=ok(await f.call('execution_status',{routeContextId:resumed.routeContextId,runId:created.runId}));
      if(!['planned','running'].includes(status.state))break;
      ok(await f.call('execution_wait',{routeContextId:resumed.routeContextId,runId:created.runId,afterSequence:status.lastEventSequence,timeoutMs:1500}));
    }
    expect(status.state,JSON.stringify(status)).toBe('completed');expect(status.evidence.verification).toBe('verified');
    await acceptCurrentReview(f.runtime.workflow,fixtureScope(f,resumed));
    const closed=ok(await f.call('task_checkpoint',{routeContextId:resumed.routeContextId,status:'completed',projectTerminal:true,summary:'Existing behavior and HTTP integration verified through the resumed task DAG',evidence:[{type:'tool',ref:`execution:${created.runId}`}],decisions:[{key:'existing-implementation-verified',value:'Existing retry behavior and the HTTP entrypoint passed the current managed verification attempt.',reason:'Both actual processes completed with verified current input and report evidence.'}]}));
    expect(closed.memoryLifecycle).toMatchObject({postflightState:'CLOSED',durabilityState:'DURABLY_CLOSED'});
    expect(ok(await f.call('workflow_status',{taskId:route.continuityTaskId,projectRoot:f.root}))).toMatchObject({phase:'CLOSED',completed:true});
  },30_000);
  it('keeps a plain inspection route without a required DAG unable to create execution',async()=>{
    const f=await fixture(),route=ok(await f.call('capability_route',{task:'Inspect the existing implementation',projectRoot:f.root}));
    expect(route.workflowContext).toMatchObject({craftRequired:false,planRequired:false,dagRequired:false});
    expect(route.allowedTools).not.toContain('execution_create');
    const c=checks(f);
    code(await f.call('execution_create',{routeContextId:route.routeContextId,objective:'Unplanned execution',nodes:[{id:'check',purpose:'Inspect',command:c.unitCommand,cwd:f.root}]}),'ROUTE_TOOL_NOT_ALLOWED');
  });
  it('holds completion evidence against another managed task write and releases the claim after postflight failure',async()=>{
    const f=await fixture(false),route=await routed(f),p=await planned(f,route),run=await execute(f,route,p);
    const other=await f.keyStore.create('independent-comment-editor');
    const otherRoute=ok(await f.call('capability_route',{task:'Fix one comment typo',projectRoot:f.root,workflow:'direct'},other.key));
    expect(otherRoute.continuityTaskId).not.toBe(route.continuityTaskId);
    const otherRevision=await plannedComment(f,otherRoute,other);
    const rewrite=()=>f.call('write_file',{routeContextId:otherRoute.routeContextId,path:f.target,content:nativeCode,stepId:'edit-comment',planVersion:otherRevision},other.key);
    ok(await rewrite());

    const original=f.runtime.memory.applyPostflight.bind(f.runtime.memory);
    let reached!:()=>void,release!:()=>void;
    const arrived=new Promise<void>(resolve=>{reached=resolve;}),barrier=new Promise<void>(resolve=>{release=resolve;});
    f.runtime.memory.applyPostflight=async input=>{
      if(input.scope.principalId!==f.principal.metadata.id)return original(input);
      reached();await barrier;throw new Error('fixture postflight write failed');
    };
    const pending=f.call('task_checkpoint',completion(route,run.created.runId));
    try{
      await Promise.race([arrived,pending.then(result=>{throw new Error(`Checkpoint failed before postflight barrier: ${JSON.stringify(result.value)}`);})]);
      const blocked=await rewrite();
      expect(blocked.error,JSON.stringify(blocked.value)).toBe(true);
      expect(JSON.stringify(blocked.value)).toContain('overlapping workspace resource claim');
      expect(await readFile(f.target,'utf8')).toBe(nativeCode);
      release();
      const failed=await pending;expect(failed.error).toBe(true);expect(JSON.stringify(failed.value)).toContain('fixture postflight write failed');
    }finally{release();f.runtime.memory.applyPostflight=original;await pending;}

    // Failure must release the same claim even though the checkpoint is resumable.
    const fresh=await f.keyStore.create('fresh-comment-editor');
    const freshRoute=ok(await f.call('capability_route',{task:'Fix one comment typo',projectRoot:f.root,workflow:'direct'},fresh.key));
    const freshRevision=await plannedComment(f,freshRoute,fresh);
    ok(await f.call('write_file',{routeContextId:freshRoute.routeContextId,path:f.target,content:nativeCode+'// corrected comment\n',stepId:'edit-comment',planVersion:freshRevision},fresh.key));
    expect(await readFile(f.target,'utf8')).toBe(nativeCode+'// corrected comment\n');
    ok(await f.call('write_file',{routeContextId:freshRoute.routeContextId,path:f.target,content:nativeCode,stepId:'edit-comment',planVersion:freshRevision},fresh.key));
    const closed=ok(await f.call('task_checkpoint',completion(route,run.created.runId)));
    expect(closed.memoryLifecycle).toMatchObject({postflightState:'CLOSED',durabilityState:'DURABLY_CLOSED'});
    const releaseAfterSuccess=await f.runtime.execution.acquireWorkspaceClaim({principalId:other.metadata.id,projectId:f.root},{writes:[f.target]});
    await releaseAfterSuccess();
  },30_000);
  it('requires source plan before direct commands even with a healthy empty vault',async()=>{
    const f=await fixture(),route=await routed(f);
    expect(route.memoryStatus).toBe('healthy');
    code(await f.call('execute_command',{routeContextId:route.routeContextId,command:nodeShellCommand('process.stdout.write("unauthorized")'),cwd:f.root}),'WORKFLOW_PLAN_REQUIRED');
    code(await f.call('execute_command',{routeContextId:route.routeContextId,command:'git diff --no-index --output=src/retry.ts first.txt second.txt',cwd:f.root}),'WORKFLOW_PLAN_REQUIRED');
    const p=await planned(f,route);ok(p.accept);expect(p.source).toMatchObject({language:'python',analysisLevel:'source_read'});
    code(await f.call('execute_command',{routeContextId:route.routeContextId,command:p.unitCommand,cwd:f.root}),'WORKFLOW_DAG_REQUIRED');
  });
  it('rejects README-only integration and wrong plan revision or target path',async()=>{
    const f=await fixture(),route=await routed(f),readme=await planned(f,route,'README.md');code(readme.accept,'WORKFLOW_CODE_EVIDENCE_REQUIRED');
    const p=await planned(f,route);ok(p.accept);
    code(await f.call('write_file',{routeContextId:route.routeContextId,path:f.target,content:nativeCode,stepId:'adapt-retry'}),'WORKFLOW_PLAN_VERSION_REQUIRED');
    code(await f.call('write_file',{routeContextId:route.routeContextId,path:f.target,content:nativeCode,stepId:'adapt-retry',planVersion:99}),'WORKFLOW_PLAN_STALE');
    code(await f.call('write_file',{routeContextId:route.routeContextId,path:path.join(f.root,'unplanned.ts'),content:nativeCode,stepId:'adapt-retry',planVersion:1}),'WORKFLOW_PATH_NOT_PLANNED');
    expect(await readFile(f.target,'utf8')).toBe(initialCode);
  });
  it('invalidates donor evidence after source changes and does not accept a mere reread as a new plan',async()=>{
    const f=await fixture(),route=await routed(f),p=await planned(f,route);ok(p.accept);
    await writeFile(path.join(f.donor,'retry.py'),'def retry(action, attempts): return None\n');
    ok(await f.call('craft_source',{routeContextId:route.routeContextId,operation:'read',role:'donor',donorId:'retry-donor',path:'retry.py'}));
    code(await f.call('write_file',{routeContextId:route.routeContextId,path:f.target,content:nativeCode,stepId:'adapt-retry',planVersion:1}),'WORKFLOW_SOURCE_STALE');
  });
  it('resumes the same task with its existing source receipts and sticky required policy',async()=>{
    const f=await fixture(),route=await routed(f);
    const donor=ok(await f.call('craft_source',{routeContextId:route.routeContextId,operation:'read',role:'donor',donorId:'retry-donor',path:'retry.py'}));
    code(await f.call('capability_route',{task:'Continue',projectRoot:f.root,workflow:'direct',continuity:{resumeTaskId:route.continuityTaskId}}),'MEMORY_POSTFLIGHT_REQUIRED');
    ok(await f.call('task_checkpoint',{routeContextId:route.routeContextId,status:'interrupted',summary:'Source acquisition recorded; implementation remains pending',evidence:[{type:'file',ref:path.join(f.donor,'retry.py'),result:'Bounded Python retry source read with server receipt'}],memoryDecision:{reasonCode:'TRANSIENT_OPERATION',explanation:'Only source acquisition occurred; no verified implementation decision is available yet.'}}));
    const resumed=ok(await f.call('capability_route',{task:'Continue',projectRoot:f.root,workflow:'direct',continuity:{resumeTaskId:route.continuityTaskId}}));
    expect(resumed.continuityTaskId).toBe(route.continuityTaskId);
    const status=ok(await f.call('workflow_status',{routeContextId:resumed.routeContextId})),contract=status.contract??status;
    expect(contract).toMatchObject({taskId:route.continuityTaskId,craftRequired:true,dagRequired:true});
    expect(contract.receipts.some((receipt:{id:string})=>receipt.id===donor.receipt.id)).toBe(true);
  });
  it('integrates Python mechanism into TypeScript with parallel real tests and exact checkpoint proof',async()=>{
    const f=await fixture(),route=await routed(f),p=await planned(f,route),run=await execute(f,route,p);
    expect(JSON.parse(await readFile(p.unitReport,'utf8'))).toMatchObject({passed:true,calls:3,failures:2});expect(JSON.parse(await readFile(p.integrationReport,'utf8'))).toMatchObject({passed:true,serverStopped:true});
    code(await f.call('task_checkpoint',{...completion(route,run.created.runId),evidence:[{type:'file',ref:f.target,result:'Implementation exists'}]}),'CONTINUITY_EXECUTION_EVIDENCE_REQUIRED');
    code(await f.call('task_checkpoint',completion(route,'00000000-0000-4000-8000-000000000000')),'CONTINUITY_EXECUTION_EVIDENCE_INVALID');
    const closed=ok(await f.call('task_checkpoint',completion(route,run.created.runId)));
    expect(closed.memoryLifecycle).toMatchObject({postflightState:'CLOSED',durabilityState:'DURABLY_CLOSED'});
  },30_000);
  it('retries failed memory sync with the same checkpoint without reexecuting successful tests',async()=>{
    const f=await fixture(),route=await routed(f),p=await planned(f,route),run=await execute(f,route,p);
    const scope={principalId:f.principal.metadata.id,projectId:f.root};const before=await f.runtime.execution.store.listAttempts(scope,run.created.runId);
    f.dependencies.supabaseDirectTransport.offline=true;
    const input=completion(route,run.created.runId),failed=await f.call('task_checkpoint',input);expect(failed.error,JSON.stringify(failed.value)).toBe(true);
    f.dependencies.supabaseDirectTransport.offline=false;
    const closed=ok(await f.call('task_checkpoint',input));expect(closed.memoryLifecycle.postflightState).toBe('CLOSED');
    expect(await f.runtime.execution.store.listAttempts(scope,run.created.runId)).toEqual(before);
  },30_000);
  it('advances target provenance after a successful planned source-modifying command before dependent verification',async()=>{
    const f=await fixture(),route=await routed(f),p=await planned(f,route,'retry.py',true),run=await execute(f,route,p);
    expect(await readFile(f.target,'utf8')).toBe(nativeCode);
    const closed=ok(await f.call('task_checkpoint',completion(route,run.created.runId)));
    expect(closed.memoryLifecycle).toMatchObject({postflightState:'CLOSED',durabilityState:'DURABLY_CLOSED'});
  },30_000);
  it('closes planned directory creation and move only with runtime directory and source-absence evidence',async()=>{
    const f=await fixture(),route=await routed(f),p=await planned(f,route),prior=ok(p.accept);
    const directory=path.join(f.root,'native'),destination=path.join(directory,'retry.ts'),report=path.join(f.root,'reports','move-report.json');
    const command=nodeShellCommand(`(async()=>{const fs=require('node:fs'),assert=require('node:assert/strict');assert.equal(fs.existsSync(${JSON.stringify(f.target)}),false);assert.equal(fs.statSync(${JSON.stringify(directory)}).isDirectory(),true);const {retry}=await import(require('node:url').pathToFileURL(${JSON.stringify(destination)}).href);let count=0;assert.equal(await retry(async()=>{if(++count<2)throw Error('transient');return 'READY';},2),'READY');assert.equal(count,2);fs.writeFileSync(${JSON.stringify(report)},JSON.stringify({passed:true,sourceAbsent:true,directoryPresent:true}));})().catch(e=>{console.error(e);process.exitCode=1;});`);
    const plan={...p.input,expectedVersion:prior.version,steps:[{id:'mkdir',purpose:'Create native module directory',kind:'edit',paths:[directory]},{id:'move',purpose:'Move implementation into native directory',kind:'edit',paths:[f.target,destination]},{id:'adapt-retry',purpose:'Adapt the moved implementation',kind:'edit',paths:[destination]},{id:'verify-move',purpose:'Verify moved native public function and expected source absence',kind:'verification',command,paths:[]}],mappings:p.input.mappings.map(mapping=>({...mapping,targetPaths:[f.target,destination],stepIds:['mkdir','move','adapt-retry']})),checks:[{id:'moved-behavior',purpose:'Retry preserved after relocation',kind:'behavior',requirementIds:['bounded-retry'],stepIds:['verify-move'],artifactPaths:[report]},{id:'moved-integration',purpose:'Moved native module loads through real target entrypoint',kind:'integration',requirementIds:['bounded-retry'],stepIds:['verify-move'],artifactPaths:[report]}]};
    await assessPlan(f.runtime.workflow,fixtureScope(f,route),plan as WorkflowPlanInput);
    const accepted=ok(await f.call('workflow_plan',{routeContextId:route.routeContextId,plan})),revision=accepted.plan.revision;
    ok(await f.call('create_directory',{routeContextId:route.routeContextId,path:directory,stepId:'mkdir',planVersion:revision}));
    ok(await f.call('move_file',{routeContextId:route.routeContextId,source:f.target,destination,stepId:'move',planVersion:revision}));
    ok(await f.call('write_file',{routeContextId:route.routeContextId,path:destination,content:nativeCode,stepId:'adapt-retry',planVersion:revision}));
    const created=ok(await f.call('execution_create',{routeContextId:route.routeContextId,objective:'Verify relocated implementation with directory and absence evidence',nodes:[{id:'verify',purpose:'Load moved retry and verify source absence',command,cwd:f.root,stepIds:['verify-move'],inputs:[directory,f.target,destination],resources:{reads:[directory,f.target,destination],writes:[report]},expectedArtifacts:[{path:report,kind:'file',required:true,hash:'sha256',artifactType:'test_report'}]}]}));
    ok(await f.call('execution_start',{routeContextId:route.routeContextId,runId:created.runId}));
    let status:any;for(let count=0;count<10;count++){status=ok(await f.call('execution_status',{routeContextId:route.routeContextId,runId:created.runId}));if(status.state!=='running')break;ok(await f.call('execution_wait',{routeContextId:route.routeContextId,runId:created.runId,afterSequence:status.lastEventSequence,timeoutMs:1500}));}
    expect(status.state,JSON.stringify(status)).toBe('completed');
    await acceptCurrentReview(f.runtime.workflow,fixtureScope(f,route));
    const closed=ok(await f.call('task_checkpoint',{...completion(route,created.runId),summary:'Native retry relocation, directory creation, and expected source absence verified'}));expect(closed.memoryLifecycle.postflightState).toBe('CLOSED');
    const workflow=ok(await f.call('workflow_status',{routeContextId:route.routeContextId}));
    expect(workflow.verification.outputStates).toEqual(expect.arrayContaining([{path:f.target,kind:'missing',hash:null},{path:directory,kind:'directory',hash:null}]));
  },30_000);
});
