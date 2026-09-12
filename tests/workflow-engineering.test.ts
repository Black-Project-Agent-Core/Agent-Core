import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { WorkflowService, type WorkflowPlanInput, type WorkflowScope } from '../src/workflow/service.js';
import { WorkspacePolicy } from '../src/runtime/workspace.js';
import { workflowHash, workflowScopeId } from '../src/workflow/store.js';
import { assessPlan, acceptCurrentReview } from './helpers/engineering.js';

const roots:string[]=[];
afterEach(async()=>{for(const root of roots.splice(0)) await rm(root,{recursive:true,force:true});});
async function fixture(brief='Fix target function correctness') {
  const root=await mkdtemp(path.join(tmpdir(),'ac-engineering-policy-'));roots.push(root);
  const target=path.join(root,'src','target.ts');await mkdir(path.dirname(target));await writeFile(target,'export function value() { return 1; }\n');
  const options={workspace:new WorkspacePolicy([root]),projectRoot:root,stateRoot:path.join(root,'runtime','state'),cacheRoot:path.join(root,'runtime','craft','sources')};
  const service=new WorkflowService(options),scope:WorkflowScope={principalId:'fixture',projectId:'agent-core://self',taskId:'engineering'};
  await service.bind(scope,{brief,workflow:'direct'});
  const plan:WorkflowPlanInput={expectedVersion:(await service.status(scope))!.version,steps:[
    {id:'edit',kind:'edit',purpose:'Fix the existing return contract',paths:[target]},
    {id:'test',kind:'verification',purpose:'Check public function behavior',command:'node verify.mjs',paths:[]},
  ],checks:[{id:'correct',kind:'integration',purpose:'Public caller correctness',stepIds:['test'],artifactPaths:[path.join(root,'reports','check.json')],requirementIds:[]}],mappings:[]};
  return {root,target,options,service,scope,plan};
}
describe('mandatory engineering authority',()=>{
  it('activates for atomic rename and direct hints and denies a bare coding plan',async()=>{
    const f=await fixture('Rename target.ts function value');
    expect(await f.service.status(f.scope)).toMatchObject({engineering:{policyVersion:'engineering-v1',required:true},planRequired:true});
    await expect(f.service.submitPlan(f.scope,f.plan)).rejects.toMatchObject({code:'ENGINEERING_ASSESSMENT_REQUIRED'});
    await expect(f.service.authorize(f.scope,{toolName:'edit_file',path:f.target})).rejects.toMatchObject({code:'WORKFLOW_PLAN_REQUIRED'});
    await expect(f.service.source(f.scope,{operation:'discover',role:'target',query:'value'})).resolves.toHaveProperty('receipt.kind','discovery');
  });
  it('upgrades a previously noncoding task on actual source edit or command without forging prior assessment',async()=>{
    for(const toolName of ['edit_file','execute_command']) {
      const f=await fixture('Inspect service status');expect((await f.service.status(f.scope))!.engineering).toBeUndefined();
      await expect(f.service.authorize(f.scope,{toolName,path:f.target,command:toolName==='execute_command'?'unknown command':undefined})).rejects.toMatchObject({code:'WORKFLOW_PLAN_REQUIRED'});
      const record=(await f.service.status(f.scope))!;expect(record.engineering?.assessment).toBeUndefined();expect(record.engineering?.required).toBe(true);
    }
  });
  it('rejects client booleans and fabricated server evidence',async()=>{
    const f=await fixture();await assessPlan(f.service,f.scope,f.plan);
    await expect(f.service.submitPlan(f.scope,{...f.plan,assessment:{alreadyChecked:true}} as any)).rejects.toMatchObject({code:'WORKFLOW_PLAN_INVALID'});
    f.plan.assessment!.decisions[0]!.evidenceReceiptIds=['fabricated'];
    await expect(f.service.submitPlan(f.scope,f.plan)).rejects.toMatchObject({code:'ENGINEERING_EVIDENCE_REQUIRED'});
  });
  it('requires earlier option decisions and verifies named native facilities',async()=>{
    const f=await fixture();await assessPlan(f.service,f.scope,f.plan);
    f.plan.assessment!.decisions[0]!.alternatives=[];
    await expect(f.service.submitPlan(f.scope,f.plan)).rejects.toMatchObject({code:'ENGINEERING_ALTERNATIVES_REQUIRED'});
    const d=f.plan.assessment!.decisions[0]!;d.choice='native';d.facility='imaginary-native-package';
    d.alternatives=[{choice:'existing',conclusion:'insufficient',reason:'Existing function lacks required file operation',evidenceReceiptIds:[f.plan.assessment!.discoveryReceiptId]}];
    await expect(f.service.submitPlan(f.scope,f.plan)).rejects.toMatchObject({code:'ENGINEERING_FACILITY_UNAVAILABLE'});
    d.facility='node:fs';expect(await f.service.submitPlan(f.scope,f.plan)).toMatchObject({phase:'READY_TO_IMPLEMENT'});
  });
  it('invalidates discovery when an untracked caller appears',async()=>{
    const f=await fixture();await assessPlan(f.service,f.scope,f.plan);
    await writeFile(path.join(f.root,'src','new-caller.ts'),'import {value} from "./target.js"; value();');
    await expect(f.service.submitPlan(f.scope,f.plan)).rejects.toMatchObject({code:'ENGINEERING_EVIDENCE_STALE'});
  });
  it('requires impact decisions for real callers and checks for limitations',async()=>{
    const f=await fixture();await writeFile(path.join(f.root,'src','caller.ts'),'import {value as compute} from "./target.js"; export const result=compute();');
    await assessPlan(f.service,f.scope,f.plan);expect(f.plan.assessment!.callerDispositions.length).toBeGreaterThan(0);
    f.plan.assessment!.callerDispositions=[];await expect(f.service.submitPlan(f.scope,f.plan)).rejects.toMatchObject({code:'ENGINEERING_CALLER_DISPOSITION_REQUIRED'});
  });
  it('detects foreign source changes while acknowledging only the selected output',async()=>{
    const f=await fixture();await assessPlan(f.service,f.scope,f.plan);await f.service.submitPlan(f.scope,f.plan);
    await f.service.authorize(f.scope,{toolName:'edit_file',path:f.target,stepId:'edit',planVersion:1});
    await writeFile(f.target,'export function value() { return 2; }');await writeFile(path.join(f.root,'src','foreign.ts'),'export const foreign=1;');
    await expect(f.service.recordOperation(f.scope,{toolName:'edit_file',path:f.target,stepId:'edit',planVersion:1})).rejects.toMatchObject({code:'ENGINEERING_UNPLANNED_CHANGE'});
    expect((await f.service.status(f.scope))!.plan!.targetBaseline[0]!.operationRecorded).toBeUndefined();
  });
  it('binds final review to reconciled content and keeps accepted evidence across restart',async()=>{
    const f=await fixture();await assessPlan(f.service,f.scope,f.plan);const accepted=await f.service.submitPlan(f.scope,f.plan);
    await writeFile(f.target,'export function value() { return 2; }');await f.service.recordOperation(f.scope,{toolName:'edit_file',path:f.target,stepId:'edit',planVersion:1});
    await expect(f.service.prepareCompletion(f.scope,{runs:[]})).rejects.toMatchObject({code:'ENGINEERING_REVIEW_REQUIRED'});
    await acceptCurrentReview(f.service,f.scope);
    const current=(await new WorkflowService(f.options).status(f.scope))!;
    expect(current.engineering?.review?.planHash).toBe(accepted.plan!.hash);expect(current.engineering?.assessment?.discoveryReceiptId).toBe(f.plan.assessment!.discoveryReceiptId);
    await writeFile(f.target,'export function value() { return 3; }');
    await expect(f.service.source(f.scope,{operation:'review',role:'target'})).rejects.toMatchObject({code:'ENGINEERING_UNPLANNED_CHANGE'});
  });
  it('rejects premature retained/fixed claims and accepts evidence-backed retained findings',async()=>{
    const f=await fixture();await assessPlan(f.service,f.scope,f.plan);await f.service.submitPlan(f.scope,f.plan);
    await writeFile(f.target,'function inner(value: number) { return value + 1; }\nexport function value(arg: number) { return inner(arg); }');
    await f.service.recordOperation(f.scope,{toolName:'edit_file',path:f.target,stepId:'edit',planVersion:1});
    const review:any=await f.service.source(f.scope,{operation:'review',role:'target'});expect(review.receipt.data.findings.length).toBeGreaterThan(0);
    const limitations=review.limitationIds.map((limit:any)=>({limitationId:limit.id,reason:'Behavior check verifies public contract within static scope',evidenceReceiptIds:[review.finalImpact.id],checkIds:['correct']}));
    await expect(f.service.submitReview(f.scope,{expectedVersion:review.version,reviewReceiptId:review.receipt.id,limitations,dispositions:[]})).rejects.toMatchObject({code:'ENGINEERING_FINDING_UNRESOLVED'});
    const dispositions=review.receipt.data.findings.map((x:any)=>({findingId:x.id,disposition:'fixed',reason:'Claim only',evidenceReceiptIds:[review.receipt.id],checkIds:['correct']}));
    await expect(f.service.submitReview(f.scope,{expectedVersion:review.version,reviewReceiptId:review.receipt.id,limitations,dispositions})).rejects.toMatchObject({code:'ENGINEERING_FINDING_STILL_PRESENT'});
    dispositions.forEach((d:any)=>{d.disposition='retained';d.reason='Public API boundary preserves the integration contract verified by correctness check';});
    await expect(f.service.submitReview(f.scope,{expectedVersion:review.version,reviewReceiptId:review.receipt.id,limitations,dispositions})).resolves.toHaveProperty('engineering.review');
  });
  it('reads closed historical record without policy defaults or changed hash',async()=>{
    const f=await fixture('Inspect diagnostics');const record=(await f.service.status(f.scope))!;
    const closed=await f.service.markClosed(f.scope,{checkpointId:'historical'});expect(closed.engineering).toBeUndefined();
    const file=path.join(f.options.stateRoot,'workflow-contracts',workflowScopeId(f.scope)+'.json'),before=await readFile(file,'utf8');
    expect((await new WorkflowService(f.options).status(f.scope))!.stateHash).toBe(closed.stateHash);
    expect(await readFile(file,'utf8')).toBe(before);expect(record.engineering).toBeUndefined();
  });
});
