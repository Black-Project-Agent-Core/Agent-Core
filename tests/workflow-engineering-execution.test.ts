import { createServer, type Server } from 'node:http';
import { createHash } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
import { executionWorkflowPending } from '../src/execution/store.js';
import type { ExecutionNodeSpec } from '../src/execution/dag.js';
import { verifyWorkflowCompletion } from '../src/runtime/workflow-completion.js';
import { createIsolatedRuntimeServices, isolatedMemoryDependencies, strictMemoryConfig } from './helpers/memory-fixture.js';
import { assessPlan, acceptCurrentReview } from './helpers/engineering.js';
import { nodeShellCommand } from './helpers/platform-command.js';

const fixtures: Array<{root:string;release:string;runtime:RuntimeServices;server:Server;audit:FileAuditLogger}> = [];
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
async function exists(file:string):Promise<boolean>{try{await access(file);return true;}catch{return false;}}
async function fixture(options: { sequential?: boolean; rogueVerification?: boolean } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'ac-engineering-execution-'));
  const a = path.join(root,'src','a.mjs'), b = path.join(root,'src','b.mjs'), foreign = path.join(root,'src','unrelated.mjs');
  const readyA = path.join(root,'reports','writer-a.ready'), readyB = path.join(root,'reports','writer-b.ready');
  const release = path.join(root,'reports','release-writers'), report = path.join(root,'reports','verified.json');
  await mkdir(path.dirname(a),{recursive:true});await mkdir(path.dirname(readyA),{recursive:true});
  await writeFile(a,'export const a = 1;\n');await writeFile(b,'export const b = 1;\n');await writeFile(foreign,'export const untouched = true;\n');
  const memory = await strictMemoryConfig(root,{AGENT_CORE_MEMORY_PRINCIPAL_ID:'engineering-fixture'});
  const config = loadConfig({},root), dependencies = isolatedMemoryDependencies(memory);
  const runtime = createIsolatedRuntimeServices([root],path.join(root,'capabilities'),undefined,memory,
    {...config.execution,enabled:true,maxConcurrency:2,resourceGovernance:{...config.execution.resourceGovernance,enabled:false}},
    undefined,undefined,undefined,undefined,undefined,undefined,undefined,dependencies);
  await runtime.execution.open();
  const keyStore = new FileKeyStore(path.join(root,'data')), principal = await keyStore.create('engineering-fixture');
  const audit = new FileAuditLogger(path.join(root,'logs'));
  const server = createServer(createHttpHandler({keyStore,auditLogger:audit,mcpHandler:createMcpHttpHandler(runtime)}));
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  fixtures.push({root,release,runtime,server,audit});
  const endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`;
  async function call(name:string,args:Record<string,unknown>) {
    const response=await fetch(endpoint,{method:'POST',headers:{Authorization:`Bearer ${principal.key}`,'Content-Type':'application/json',Accept:'application/json, text/event-stream'},
      body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})});
    const envelope=await response.json() as any;
    const result=JSON.parse(envelope.result?.content?.[0]?.text??'{}');
    expect(envelope.error??envelope.result?.isError,JSON.stringify(result)).toBeFalsy();
    return result;
  }
  const route=await call('capability_route',{task:'Implement two existing independent modules and verify their combined behavior through a multi-step DAG',projectRoot:root,workflow:'dag'});
  const scope={principalId:'engineering-fixture',projectId:'agent-core://self',taskId:route.continuityTaskId};
  const executionScope={principalId:principal.metadata.id,projectId:root};
  // Only the harness owns the excluded control files. Managed nodes write exactly their claimed source target.
  const writer=(target:string,content:string)=>nodeShellCommand(`const fs=require('node:fs');fs.writeFileSync(${JSON.stringify(target)},${JSON.stringify(content)});const deadline=Date.now()+45000;const timer=setInterval(()=>{if(fs.existsSync(${JSON.stringify(release)})){clearInterval(timer);}else if(Date.now()>deadline){clearInterval(timer);console.error('Fixture barrier was not released');process.exitCode=1;}},20);`);
  const commandA=options.sequential
    ? nodeShellCommand(`require('node:fs').writeFileSync(${JSON.stringify(a)},'export const a = 2;\\n');`)
    : writer(a,'export const a = 2;\n');
  const commandB=options.sequential ? writer(a,'export const a = 4;\n') : writer(b,'export const b = 3;\n');
  const secondTarget=options.sequential?a:b;
  const verification=nodeShellCommand(`(async()=>{const fs=require('node:fs');const assert=require('node:assert/strict');const url=require('node:url');const {a}=await import(url.pathToFileURL(${JSON.stringify(a)}));const {b}=await import(url.pathToFileURL(${JSON.stringify(b)}));assert.equal(a+b,5);${options.rogueVerification?`fs.writeFileSync(${JSON.stringify(foreign)},'export const untouched = false;\\n');`:''}fs.writeFileSync(${JSON.stringify(report)},JSON.stringify({passed:true,sum:a+b}));})().catch(error=>{console.error(error);process.exitCode=1;});`);
  const plan=await runtime.workflow.submitPlan(scope,await assessPlan(runtime.workflow,scope,{
    expectedVersion:(await runtime.workflow.status(scope))!.version,mappings:[],steps:[
      {id:'a',kind:'command',purpose:'Update first independent module',command:commandA,paths:[a]},
      {id:'b',kind:'command',purpose:'Update second implementation step',command:commandB,paths:[secondTarget]},
      {id:'verify',kind:'verification',purpose:'Verify combined final module behavior',command:verification,paths:[]},
    ],checks:[{id:'combined',kind:'integration',purpose:'Both independently written modules compose correctly',requirementIds:[],stepIds:['verify'],artifactPaths:[report]}],
  }));
  const nodes:ExecutionNodeSpec[]=[
    {id:'a',purpose:'Update first independent module',command:commandA,cwd:root,stepIds:['a'],inputs:[a,foreign],resources:{reads:[a,foreign],writes:[a]},expectedArtifacts:[{path:a,hash:'sha256'}]},
    {id:'b',purpose:'Update second implementation step',command:commandB,cwd:root,stepIds:['b'],inputs:[secondTarget],dependsOn:options.sequential?['a']:[],resources:{reads:[secondTarget],writes:[secondTarget]},expectedArtifacts:[{path:secondTarget,hash:'sha256'}]},
    {id:'verify',purpose:'Verify combined final module behavior',command:verification,cwd:root,stepIds:['verify'],dependsOn:['a','b'],inputs:[a,b],
      resources:{reads:[a,b],writes:[report]},expectedArtifacts:[{path:report,hash:'sha256',artifactType:'test_report'}]},
  ];
  const created=await runtime.execution.create(executionScope,{objective:'Implement and verify the two independent modules',continuityTaskId:scope.taskId,
    originRouteContextId:route.routeContextId,nodes,maxConcurrency:2});
  await runtime.execution.start(executionScope,created.runId,{originRouteContextId:route.routeContextId});
  const deadline=Date.now()+45000;
  while(!await exists(readyA)||!await exists(readyB)){
    if(options.sequential){
      if(await readFile(a,'utf8')==='export const a = 4;\n'){await writeFile(readyA,'ready');await writeFile(readyB,'ready');}
    }else{
      if(await readFile(a,'utf8')==='export const a = 2;\n')await writeFile(readyA,'ready');
      if(await readFile(b,'utf8')==='export const b = 3;\n')await writeFile(readyB,'ready');
    }
    if(Date.now()>deadline)throw new Error('Both managed writers did not reach the functional barrier');
    await new Promise(resolve=>setTimeout(resolve,30));
  }
  return{root,a,b,foreign,readyA,readyB,release,report,runtime,call,scope,executionScope,route,plan,created};
}

async function terminal(f:Awaited<ReturnType<typeof fixture>>){
  let view=(await f.runtime.execution.status(f.executionScope,f.created.runId))!;
  const deadline=Date.now()+45000;
  while(['planned','running'].includes(view.state)){
    if(Date.now()>deadline)throw new Error('Managed fixture did not settle');
    view=(await f.runtime.execution.wait(f.executionScope,f.created.runId,view.lastEventSequence,undefined,500)).state;
  }
  return view;
}

afterEach(async()=>{for(const f of fixtures.splice(0)){
  await writeFile(f.release,'release');f.server.closeAllConnections();await new Promise<void>(resolve=>f.server.close(()=>resolve()));
  await f.runtime.execution.close();await f.runtime.memory.close();await f.audit.close();
  if(!path.resolve(f.root).startsWith(path.resolve(tmpdir())+path.sep)||!path.basename(f.root).startsWith('ac-engineering-execution-'))throw new Error('Fixture cleanup escaped temp');
  await rm(f.root,{recursive:true,force:true});
}});

describe('engineering workflow with concurrent managed writes',()=>{
  it('reconciles a verification-labeled command as pending when it writes undeclared source despite a successful exit',async()=>{
    const f=await fixture({rogueVerification:true});await writeFile(f.release,'release');
    const run=await terminal(f);
    expect(run.state,JSON.stringify(run)).toBe('blocked');
    expect(run.nodes.find(node=>node.nodeId==='verify')?.attemptCount).toBe(1);
    expect(executionWorkflowPending(run).length).toBeGreaterThan(0);
    expect(executionWorkflowPending(run)).toEqual([expect.objectContaining({nodeId:'verify',attemptNo:1,error:'Source differs from its reconciled planned output'})]);
    expect((await f.runtime.workflow.status(f.scope))!.plan!.operationReceipts).toHaveLength(2);
    await expect(acceptCurrentReview(f.runtime.workflow,f.scope)).rejects.toMatchObject({code:'ENGINEERING_UNPLANNED_CHANGE'});
  },90000);
  it('retains both pending baselines, reconciles exact attempts once, then verifies the combined final change',async()=>{
    const f=await fixture();
    const pending=(await f.runtime.workflow.status(f.scope))!;
    expect(pending.plan!.operationReceipts??[]).toEqual([]);
    expect(pending.plan!.targetBaseline.find(item=>item.path===f.a)?.hash).toBe(hash('export const a = 1;\n'));
    expect(pending.plan!.targetBaseline.find(item=>item.path===f.b)?.hash).toBe(hash('export const b = 1;\n'));
    expect(await readFile(f.a,'utf8')).toBe('export const a = 2;\n');expect(await readFile(f.b,'utf8')).toBe('export const b = 3;\n');
    await writeFile(f.release,'release');
    const run=await terminal(f);
    expect(run.state,JSON.stringify(run)).toBe('completed');expect(run.evidence).toMatchObject({verification:'verified',current:true});
    expect(executionWorkflowPending(run)).toEqual([]);
    const contract=(await f.runtime.workflow.status(f.scope))!,receipts=contract.plan!.operationReceipts!;
    expect(receipts).toHaveLength(2);expect(new Set(receipts.map(item=>item.attemptId)).size).toBe(2);
    for(const receipt of receipts){
      expect(receipt).toMatchObject({runId:run.runId,attemptNo:1,planRevision:f.plan.plan!.revision,planHash:f.plan.plan!.hash});
      const marker=await f.runtime.execution.logs.readResult(run.runId,receipt.nodeId,receipt.attemptNo);
      expect(marker?.attemptId).toBe(receipt.attemptId);expect(marker?.provenance?.writeManifestHash).toBe(receipt.outputManifestHash);
    }
    expect(JSON.parse(await readFile(f.report,'utf8'))).toEqual({passed:true,sum:5});
    await f.runtime.execution.start(f.executionScope,run.runId,{originRouteContextId:f.route.routeContextId});
    expect((await f.runtime.workflow.status(f.scope))!.plan!.operationReceipts).toEqual(receipts);
    await acceptCurrentReview(f.runtime.workflow,f.scope);
    const checkpoint=await f.call('task_checkpoint',{routeContextId:f.route.routeContextId,status:'completed',projectTerminal:true,
      summary:'Two disjoint managed writes and their combined behavior were verified',evidence:[{type:'tool',ref:`execution:${run.runId}`}],
      memoryDecision:{reasonCode:'TRANSIENT_OPERATION',explanation:'This task verifies isolated temporary fixture behavior.'}});
    expect(checkpoint.memoryLifecycle).toMatchObject({postflightState:'CLOSED',durabilityState:'DURABLY_CLOSED'});
    expect((await f.runtime.workflow.status(f.scope))!.phase).toBe('CLOSED');
  },90000);

  it('does not let active disjoint writers legitimize a changed unrelated source',async()=>{
    const f=await fixture();await writeFile(f.foreign,'export const untouched = false;\n');await writeFile(f.release,'release');
    const run=await terminal(f);
    expect(run.state,JSON.stringify(run)).toBe('blocked');
    expect(executionWorkflowPending(run).length).toBeGreaterThan(0);
    expect(run.nodes.find(node=>node.nodeId==='verify')?.attemptCount).toBe(0);
    expect((await f.runtime.workflow.status(f.scope))!.plan!.operationReceipts??[]).toEqual([]);
    await expect(acceptCurrentReview(f.runtime.workflow,f.scope)).rejects.toMatchObject({code:'ENGINEERING_UNPLANNED_CHANGE'});
  },90000);

  it('allows final fan-in after an acknowledged downstream writer supersedes its predecessor output',async()=>{
    const f=await fixture({sequential:true});await writeFile(f.release,'release');
    const run=await terminal(f);
    expect(run.state,JSON.stringify(run)).toBe('completed');
    expect(run.evidence.nodes.find(node=>node.nodeId==='a')?.applicability).toBe('inputs_changed');
    expect(run.evidence.nodes.find(node=>node.nodeId==='b')?.applicability).toBe('current');
    expect(run.evidence.nodes.find(node=>node.nodeId==='verify')).toMatchObject({applicability:'current',evidenceState:'verified'});
    expect((await f.runtime.workflow.status(f.scope))!.plan!.operationReceipts).toHaveLength(2);
    expect(JSON.parse(await readFile(f.report,'utf8'))).toEqual({passed:true,sum:5});
    const consumer=run.nodes.find(node=>node.nodeId==='verify')!;
    // Supersession never excuses an immutable input change or a stale verification prerequisite.
    const permits=(dependency:string)=> (f.runtime.execution as any).acknowledgedSupersededDependency(f.executionScope,run,consumer,dependency);
    expect(await permits('a')).toBe(true);
    await writeFile(f.foreign,'export const untouched = false;\n');
    expect(await permits('a')).toBe(false);
    await writeFile(f.foreign,'export const untouched = true;\n');
    const verifiedReport=await readFile(f.report,'utf8');
    await writeFile(f.report,JSON.stringify({passed:false}));
    const staleCheck=(await f.runtime.execution.status(f.executionScope,run.runId))!;
    expect(staleCheck.evidence.nodes.find(node=>node.nodeId==='verify')?.applicability).toBe('outputs_changed');
    expect(await (f.runtime.execution as any).acknowledgedSupersededDependency(f.executionScope,staleCheck,consumer,'verify')).toBe(false);
    await writeFile(f.report,verifiedReport);
    await acceptCurrentReview(f.runtime.workflow,f.scope);
    const checkpoint=await f.call('task_checkpoint',{routeContextId:f.route.routeContextId,status:'completed',projectTerminal:true,
      summary:'Sequential implementation receipts remain valid for final verification fan-in',evidence:[{type:'tool',ref:`execution:${run.runId}`}],
      memoryDecision:{reasonCode:'TRANSIENT_OPERATION',explanation:'This task verifies isolated temporary fixture behavior.'}});
    expect(checkpoint.memoryLifecycle).toMatchObject({postflightState:'CLOSED',durabilityState:'DURABLY_CLOSED'});
  },90000);

  it('blocks closure for a pending attempt even when its run is omitted from checkpoint evidence',async()=>{
    const f=await fixture();await writeFile(f.release,'release');const run=await terminal(f);
    expect(run.state).toBe('completed');await acceptCurrentReview(f.runtime.workflow,f.scope);
    const marker=(await f.runtime.execution.logs.readResult(run.runId,'a',1))!;
    // Persist the exact successful marker as recovery would after a crash before acknowledgement.
    await f.runtime.execution.store.completeAttempt(f.executionScope,marker,{workflowPending:true});
    await f.runtime.execution.store.setRunState(f.executionScope,run.runId,'blocked');
    await expect(verifyWorkflowCompletion(f.runtime,{principalId:f.scope.principalId,projectId:f.root},{
      status:'completed',summary:'Attempt closure with the pending run omitted',evidence:[],
      workspaceRoot:f.root,memoryContextId:f.route.memoryContextId??f.route.memorySnapshot?.memoryContextId,
      continuityTaskId:f.scope.taskId,continuityTurnId:f.route.continuityTurnId,routeContextId:f.route.routeContextId,
    })).rejects.toMatchObject({code:'WORKFLOW_OPERATION_RECEIPT_PENDING'});
    expect((await f.runtime.workflow.status(f.scope))!.phase).not.toBe('CLOSED');
  },90000);
});
