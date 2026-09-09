import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { WorkflowService, type WorkflowPlanInput, type WorkflowScope, type WorkflowRunEvidence } from '../src/workflow/service.js';
import { workflowHash, workflowScopeId } from '../src/workflow/store.js';
import { WorkspacePolicy } from '../src/runtime/workspace.js';
import { spawnSync } from 'node:child_process';
import { snapshotMatchesDonor } from '../src/workflow/source.js';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive:true,force:true }); });
async function setup() {
  const root = await mkdtemp(path.join(tmpdir(),'workflow-test-')); roots.push(root);
  const donor = path.join(root,'referensi','donor'), target = path.join(root,'src','target.ts');
  await mkdir(donor,{recursive:true}); await mkdir(path.dirname(target),{recursive:true});
  await writeFile(path.join(donor,'worker.py'),'def retry(job):\n    return job()\n');
  await writeFile(path.join(donor,'README.md'),'# Retry system\nUseful code lives in worker.py\n');
  await writeFile(path.join(donor,'LICENSE'),'MIT License\nPermission is hereby granted\n');
  await writeFile(target,'export const run = () => 1;\n');
  const options = { workspace:new WorkspacePolicy([root]),stateRoot:path.join(root,'vault','.agent-core','state'),cacheRoot:path.join(root,'cache'),projectRoot:root };
  const service = new WorkflowService(options), scope:WorkflowScope={principalId:'principal-a',projectId:'agent-core://self',taskId:'task-one'};
  const bind = {brief:'Implement retry feature from donor source and integrate tests',workflow:'direct' as const,craft:{requirements:[{id:'retry',description:'Retry safely'}],donors:[{id:'donor',source:donor}]}};
  await service.bind(scope,bind);
  return {root,donor,target,options,service,scope,bind};
}
async function planFixture(f:Awaited<ReturnType<typeof setup>>, donorFile='worker.py') {
  const donor = await f.service.source(f.scope,{operation:'read',role:'donor',donorId:'donor',path:donorFile});
  const target = await f.service.source(f.scope,{operation:'read',role:'target',path:f.target});
  const current = (await f.service.status(f.scope))!;
  const report = path.join(f.root,'result.json');
  const input:WorkflowPlanInput={expectedVersion:current.version,steps:[
    {id:'edit',purpose:'Adapt native retry seam',kind:'edit',paths:[f.target]},
    {id:'check',purpose:'Test behavior through target entrypoint',kind:'verification',command:'node tests/check.mjs',paths:[]},
  ],mappings:[{requirementId:'retry',donorId:'donor',donorReceiptIds:[donor.receipt!.id],targetReceiptIds:[target.receipt!.id],mechanism:'Bound retries at target seam',inputs:'Job callback',outputs:'Callback result',dependencies:'No donor runtime dependencies',failureBehavior:'Propagate final failure',reuse:'Keep target dispatcher',adaptation:'Adapt retry condition',rejected:'Donor CLI is irrelevant',targetPaths:[f.target],stepIds:['edit'],license:{mode:'adapt_mechanism',receiptIds:[]}}],checks:[
    {id:'behavior',purpose:'Retry calls bounded',kind:'behavior',requirementIds:['retry'],stepIds:['check'],artifactPaths:[report]},
    {id:'integration',purpose:'Target public entrypoint works',kind:'integration',requirementIds:['retry'],stepIds:['check'],artifactPaths:[report]},
  ]};
  return {input,report,donor,target};
}
describe('workflow contracts',()=>{
  it('binds persistent scope and refuses direct-mode downgrade after resume',async()=>{
    const f=await setup(); const first=(await f.service.status(f.scope))!;
    expect(first.craftRequired).toBe(true);expect(first.dagRequired).toBe(true);
    const next=await new WorkflowService(f.options).bind(f.scope,{brief:'Continue',workflow:'direct'});
    expect(next.craftRequired).toBe(true);expect(next.dagRequired).toBe(true);expect(next.donors).toEqual(first.donors);
    expect(await f.service.status({...f.scope,principalId:'other'})).toBeNull();
    await expect(f.service.authorize(f.scope,{toolName:'edit_file',path:f.target})).rejects.toMatchObject({code:'WORKFLOW_PLAN_REQUIRED'});
  });
  it('rejects README-only grounding and fabricated receipt IDs',async()=>{
    const f=await setup(); const p=await planFixture(f,'README.md');
    await expect(f.service.submitPlan(f.scope,p.input)).rejects.toMatchObject({code:'WORKFLOW_CODE_EVIDENCE_REQUIRED'});
    p.input.mappings![0]!.donorReceiptIds=['invented'];
    await expect(f.service.submitPlan(f.scope,p.input)).rejects.toMatchObject({code:'WORKFLOW_RECEIPT_INVALID'});
  });
  it('rejects receipts that delivered only blank lines or a comment header from a code file',async()=>{
    const f=await setup();await writeFile(path.join(f.donor,'worker.py'),'# Donor header only\n\ndef retry(job): return job()\n');
    const p=await planFixture(f),header=await f.service.source(f.scope,{operation:'read',role:'donor',donorId:'donor',path:'worker.py',startLine:1,lineCount:2});
    p.input.expectedVersion=(await f.service.status(f.scope))!.version;p.input.mappings![0]!.donorReceiptIds=[header.receipt!.id];
    await expect(f.service.submitPlan(f.scope,p.input)).rejects.toMatchObject({code:'WORKFLOW_CODE_EVIDENCE_REQUIRED'});
  });
  it('rejects absent donors and stale donor source before plan acceptance',async()=>{
    const f=await setup();
    await expect(f.service.source(f.scope,{operation:'read',role:'donor',donorId:'invented',path:'worker.py'})).rejects.toMatchObject({code:'WORKFLOW_DONOR_NOT_FOUND'});
    const p=await planFixture(f);await writeFile(path.join(f.donor,'worker.py'),'def retry(job): return None\n');
    await expect(f.service.submitPlan(f.scope,p.input)).rejects.toMatchObject({code:'WORKFLOW_SOURCE_STALE'});
  });
  it('retains historical donor receipts but rejects them after changing the registered source',async()=>{
    const f=await setup(),p=await planFixture(f);await f.service.submitPlan(f.scope,p.input);
    const replacement=path.join(f.root,'replacement-donor');await mkdir(replacement);await writeFile(path.join(replacement,'worker.py'),'def retry(job):\n    return job(2)\n');
    const changed=await f.service.bind(f.scope,{...f.bind,craft:{...f.bind.craft,donors:[{id:'donor',source:replacement}]}});
    expect(changed.plan).toBeUndefined();expect(changed.receipts.some(r=>r.id===p.donor.receipt!.id)).toBe(true);
    p.input.expectedVersion=changed.version;
    await expect(f.service.submitPlan(f.scope,p.input)).rejects.toMatchObject({code:'WORKFLOW_SOURCE_STALE'});
    const current=await f.service.source(f.scope,{operation:'read',role:'donor',donorId:'donor',path:'worker.py'});
    p.input.mappings![0]!.donorReceiptIds=[current.receipt!.id];p.input.expectedVersion=current.version;
    await expect(f.service.submitPlan(f.scope,p.input)).resolves.toMatchObject({phase:'READY_TO_IMPLEMENT'});
    const restarted=(await new WorkflowService(f.options).status(f.scope))!;
    expect(restarted.receipts.some(r=>r.id===p.donor.receipt!.id)).toBe(true);
  });
  it('binds donor pin identity to source and ref while retaining legacy HEAD identity',async()=>{
    const f=await setup();await planFixture(f);const record=(await f.service.status(f.scope))!;
    const snapshot={...record.snapshots.find(s=>s.role==='donor')!,source:'https://example.com/donor.git',commit:'a'.repeat(40)};
    const donor={id:'donor',source:snapshot.source};
    expect(snapshotMatchesDonor(snapshot,donor)).toBe(true);
    expect(snapshotMatchesDonor(snapshot,{...donor,ref:'HEAD'})).toBe(true);
    expect(snapshotMatchesDonor(snapshot,{...donor,ref:'release'})).toBe(false);
    expect(snapshotMatchesDonor({...snapshot,ref:'main'},{...donor,ref:'release'})).toBe(false);
    expect(snapshotMatchesDonor({...snapshot,ref:'release'},{...donor,ref:'release'})).toBe(true);
    expect(snapshotMatchesDonor(snapshot,{...donor,source:'https://example.com/replacement.git'})).toBe(false);
  });
  it('rejects Git refs for local source paths instead of claiming a pinned revision',async()=>{
    const f=await setup();await f.service.bind(f.scope,{...f.bind,craft:{...f.bind.craft,donors:[{id:'donor',source:f.donor,ref:'main'}]}});
    await expect(f.service.source(f.scope,{operation:'read',role:'donor',donorId:'donor',path:'worker.py'})).rejects.toMatchObject({code:'WORKFLOW_SOURCE_REF_UNSUPPORTED'});
    expect((await f.service.status(f.scope))!.receipts).toHaveLength(0);
  });
  it('requires exact existing target receipts even when an unrelated source seam was read',async()=>{
    const f=await setup(),p=await planFixture(f),other=path.join(f.root,'src','other.ts');await writeFile(other,'export const other = () => 2;\n');
    p.input.steps[0]!.paths=[other];p.input.mappings![0]!.targetPaths=[other];
    await expect(f.service.submitPlan(f.scope,p.input)).rejects.toMatchObject({code:'WORKFLOW_TARGET_EVIDENCE_REQUIRED'});
    const read=await f.service.source(f.scope,{operation:'read',role:'target',path:other});
    p.input.mappings![0]!.targetReceiptIds=[read.receipt!.id];p.input.expectedVersion=read.version;
    await expect(f.service.submitPlan(f.scope,p.input)).resolves.toMatchObject({phase:'READY_TO_IMPLEMENT'});
  });
  it('requires an explicit existing integration seam for new-only targets and includes it in tested inputs',async()=>{
    const f=await setup(),p=await planFixture(f),created=path.join(f.root,'src','new.ts');
    p.input.steps[0]!.paths=[created];p.input.mappings![0]!.targetPaths=[created];
    await expect(f.service.submitPlan(f.scope,p.input)).rejects.toMatchObject({code:'WORKFLOW_TARGET_EVIDENCE_REQUIRED'});
    p.input.mappings![0]!.integrationSeamPaths=[path.join(f.root,'src','missing-seam.ts')];
    await expect(f.service.submitPlan(f.scope,p.input)).rejects.toMatchObject({code:'WORKFLOW_TARGET_EVIDENCE_REQUIRED'});
    p.input.mappings![0]!.integrationSeamPaths=[f.target];
    const accepted=await f.service.submitPlan(f.scope,p.input);
    expect(accepted.plan!.targetBaseline.map(entry=>entry.path.toLowerCase())).toEqual(expect.arrayContaining([created.toLowerCase(),f.target.toLowerCase()]));
    await writeFile(f.target,'export const run = () => 3;\n');
    await expect(f.service.authorize(f.scope,{toolName:'write_file',path:created,stepId:'edit',planVersion:1})).rejects.toMatchObject({code:'WORKFLOW_TARGET_STALE'});
  });
  it('does not allow an unmapped step to mutate an unread existing file',async()=>{
    const f=await setup(),p=await planFixture(f),other=path.join(f.root,'src','other.ts');await writeFile(other,'export const other = 2;\n');
    p.input.steps.push({id:'unmapped',purpose:'Mutate another entrypoint',kind:'edit',paths:[other]});
    await expect(f.service.submitPlan(f.scope,p.input)).rejects.toMatchObject({code:'WORKFLOW_MAPPING_REQUIRED'});
    p.input.mappings![0]!.stepIds.push('unmapped');
    await expect(f.service.submitPlan(f.scope,p.input)).rejects.toMatchObject({code:'WORKFLOW_TARGET_EVIDENCE_REQUIRED'});
  });
  it('atomically versions accepted plans and reloads strict state after restart',async()=>{
    const f=await setup(),p=await planFixture(f);const accepted=await f.service.submitPlan(f.scope,p.input);
    expect(accepted.phase).toBe('READY_TO_IMPLEMENT');expect(accepted.plan!.revision).toBe(1);
    await expect(f.service.submitPlan(f.scope,p.input)).rejects.toMatchObject({code:'WORKFLOW_VERSION_CONFLICT'});
    const restarted=new WorkflowService(f.options); expect((await restarted.status(f.scope))!.plan!.hash).toBe(accepted.plan!.hash);
    const file=path.join(f.options.stateRoot,'workflow-contracts',workflowScopeId(f.scope)+'.json');
    const raw=JSON.parse(await readFile(file,'utf8'));raw.craftRequired=false;await writeFile(file,JSON.stringify(raw));
    await expect(restarted.status(f.scope)).rejects.toMatchObject({code:'WORKFLOW_STATE_CORRUPT'});
  });
  it('requires accepted step and command binding and protects reference files',async()=>{
    const f=await setup(),p=await planFixture(f);await f.service.submitPlan(f.scope,p.input);
    await expect(f.service.authorize(f.scope,{toolName:'execute_command',command:'node tests/check.mjs',stepId:'check'})).rejects.toMatchObject({code:'WORKFLOW_DAG_REQUIRED'});
    await expect(f.service.authorize(f.scope,{toolName:'write_file',path:path.join(f.donor,'worker.py'),stepId:'edit'})).rejects.toMatchObject({code:'WORKFLOW_TARGET_PROTECTED'});
    await expect(f.service.authorize(f.scope,{toolName:'write_file',path:path.join(f.options.stateRoot,'memory-lifecycles','forged.json'),stepId:'edit'})).rejects.toMatchObject({code:'WORKFLOW_TARGET_PROTECTED'});
    await expect(f.service.authorize(f.scope,{toolName:'edit_file',path:f.target})).rejects.toMatchObject({code:'WORKFLOW_STEP_REQUIRED'});
    await expect(f.service.assertExecution(f.scope,{operation:'execution_create',nodes:[{command:'echo fake',stepIds:['check']}]})).rejects.toMatchObject({code:'WORKFLOW_COMMAND_NOT_PLANNED'});
  });
  it('invalidates mutation when target or donor changes after acceptance',async()=>{
    const f=await setup(),p=await planFixture(f);await f.service.submitPlan(f.scope,p.input);
    await writeFile(f.target,'export const run = () => 99;\n');
    await expect(f.service.authorize(f.scope,{toolName:'edit_file',path:f.target,stepId:'edit'})).rejects.toMatchObject({code:'WORKFLOW_TARGET_STALE'});
  });
  it('requires exact write claims for command targets and verification artifacts',async()=>{
    const f=await setup(),p=await planFixture(f);await f.service.submitPlan(f.scope,p.input);
    const node={command:'node tests/check.mjs',stepIds:['check']};
    await expect(f.service.assertExecution(f.scope,{operation:'execution_create',nodes:[node]})).rejects.toMatchObject({code:'WORKFLOW_RESOURCE_COVERAGE_REQUIRED'});
    await expect(f.service.assertExecution(f.scope,{operation:'execution_create',nodes:[{...node,resources:{writes:[f.target,p.report]}}]})).rejects.toMatchObject({code:'WORKFLOW_PATH_NOT_PLANNED'});
    await expect(f.service.assertExecution(f.scope,{operation:'execution_create',nodes:[{...node,resources:{writes:[p.report],exclusive:['fixture-server']}}]})).resolves.toMatchObject({planRevision:'1'});
  });
  it('protects explicitly configured authority roots even for lightweight operations',async()=>{
    const f=await setup(),service=new WorkflowService({...f.options,protectedRoots:[path.join(f.root,'execution-state')]}),scope={...f.scope,taskId:'atomic-authority'};
    await service.bind(scope,{brief:'Fix a typo',workflow:'direct'});
    await expect(service.authorize(scope,{toolName:'write_file',path:path.join(f.root,'execution-state','result.json')})).rejects.toMatchObject({code:'WORKFLOW_TARGET_PROTECTED'});
  });
  it('records its own successful edits without accepting unrelated source changes',async()=>{
    const f=await setup(),p=await planFixture(f);await f.service.submitPlan(f.scope,p.input);
    const operation={toolName:'edit_file',path:f.target,stepId:'edit',planVersion:1};
    await f.service.authorize(f.scope,operation);await f.service.authorize(f.scope,operation);
    await writeFile(f.target,'export const run = () => 2;\n');
    await f.service.recordOperation(f.scope,operation);
    await expect(f.service.authorize(f.scope,operation)).resolves.toMatchObject({phase:'IMPLEMENTING'});
    await writeFile(f.target,'unrelated external edit');
    await expect(f.service.authorize(f.scope,operation)).rejects.toMatchObject({code:'WORKFLOW_TARGET_STALE'});
  });
  it('resumes around an abandoned process ticket and waits for a live ticket',async()=>{
    const f=await setup(),directory=path.join(f.options.cacheRoot,'locks',workflowScopeId(f.scope));
    await mkdir(directory,{recursive:true});
    const exited=spawnSync(process.execPath,['-e','']);expect(exited.status).toBe(0);
    await writeFile(path.join(directory,'dead.json'),JSON.stringify({pid:exited.pid,token:'dead',number:1}));
    const live=path.join(directory,'live.json');await writeFile(live,JSON.stringify({pid:process.pid,token:'live',number:1}));
    let completed=false;
    const pending=f.service.bind(f.scope,{brief:'Continue'}).then(result=>{completed=true;return result;});
    await new Promise(resolve=>setTimeout(resolve,75));expect(completed).toBe(false);
    await rm(live);expect((await pending).taskId).toBe(f.scope.taskId);
  });
  it('keeps ordinary explanation turns outside mandatory donor workflow',async()=>{
    const f=await setup(),scope={...f.scope,taskId:'explanation'};
    const record=await f.service.bind(scope,{brief:'Jelaskan cara craft dan style coding',workflow:'direct'});
    expect(record.craftRequired).toBe(false);expect(record.planRequired).toBe(false);
  });
  it('keeps external API object configuration outside coding plans without weakening implementation or explicit policy',async()=>{
    const f=await setup();
    for(const [index,brief] of ['Create a Langflow flow, add ChatInput and ChatOutput nodes, then connect them','Create a GitHub issue for the reported bug','Create a release describing the existing fixes'].entries()){
      expect((await f.service.bind({...f.scope,taskId:'external-'+index},{brief})).planRequired).toBe(false);
    }
    expect((await f.service.bind({...f.scope,taskId:'generic-build'},{brief:'Build something useful'})).planRequired).toBe(true);
    expect((await f.service.bind({...f.scope,taskId:'real-code'},{brief:'Create a TypeScript module to open GitHub issues'})).planRequired).toBe(true);
    expect((await f.service.bind({...f.scope,taskId:'explicit-api-dag'},{brief:'Create a GitHub issue',workflow:'dag'})).planRequired).toBe(true);
  });
  it('includes separately bounded context in policy and invalidates changed context while preserving task identity',async()=>{
    const f=await setup(),scope={...f.scope,taskId:'context-only'};
    const ordinary=await f.service.bind({...scope,taskId:'target-context'},{brief:'Implement feature',context:'Workspace root E:\\Projects\\Agent-Core target'});
    expect(ordinary).toMatchObject({planRequired:true,craftRequired:false});
    const diagnostic=await f.service.bind({...scope,taskId:'diagnostic-context'},{brief:'Print a bounded diagnostic message',context:'Workspace root C:\\Temp\\agent-core-execution-mcp-create-case'});
    expect(diagnostic).toMatchObject({planRequired:false,craftRequired:false,dagRequired:false});
    const record=await f.service.bind(scope,{brief:'Please handle this request',context:'Implement retry from donor referensi/retry and integrate the native endpoint',workflow:'direct'});
    expect(record).toMatchObject({craftRequired:true,dagRequired:true,context:'Implement retry from donor referensi/retry and integrate the native endpoint'});
    expect((await new WorkflowService(f.options).status(scope))!.context).toBe(record.context);
    await expect(f.service.bind({...scope,taskId:'large-context'},{brief:'Build something',context:'x'.repeat(20_001)})).rejects.toMatchObject({code:'WORKFLOW_BRIEF_INVALID'});
    const p=await planFixture(f);await f.service.submitPlan(f.scope,p.input);
    expect((await f.service.bind(f.scope,{brief:'Continue',context:'Implement an additional acceptance constraint'})).plan).toBeUndefined();
  });
  it('does not attribute a completed old command to a superseding plan revision',async()=>{
    const f=await setup(),p=await planFixture(f);p.input.steps[0]={id:'edit',purpose:'Apply implementation',kind:'command',command:'node old.mjs',paths:[f.target]};
    const first=await f.service.submitPlan(f.scope,p.input);
    p.input.expectedVersion=first.version;p.input.steps[0]!.command='node new.mjs';await f.service.submitPlan(f.scope,p.input);
    await writeFile(f.target,'export const run = () => 2;\n');
    await expect(f.service.recordOperation(f.scope,{toolName:'execute_command',command:'node old.mjs',paths:[f.target],stepId:'edit',planVersion:1,viaExecution:true})).rejects.toMatchObject({code:'WORKFLOW_PLAN_STALE'});
    await expect(f.service.recordOperation(f.scope,{toolName:'execute_command',command:'node old.mjs',paths:[f.target],stepId:'edit',planVersion:2,viaExecution:true})).rejects.toMatchObject({code:'WORKFLOW_COMMAND_NOT_PLANNED'});
  });
  it('keeps atomic typo fixes light, while relative donor review-then-implement remains mandatory',async()=>{
    const f=await setup();
    const atomic=await f.service.bind({...f.scope,taskId:'atomic'},{brief:'Fix typo in src/title.ts',workflow:'direct'});
    expect(atomic.planRequired).toBe(false);expect(atomic.craftRequired).toBe(false);
    const craft=await f.service.bind({...f.scope,taskId:'relative'},{brief:'Review donor referensi/retry then implement feature',workflow:'direct'});
    expect(craft.planRequired).toBe(true);expect(craft.craftRequired).toBe(true);expect(craft.dagRequired).toBe(true);
    const source=await f.service.source(f.scope,{operation:'read',role:'donor',donorId:'donor',path:'worker.py'});
    expect(source).toMatchObject({language:'python',analysisLevel:'source_read'});
  });
  it('detects explicit filename-only donors without treating ordinary target filenames as donors',async()=>{
    const f=await setup();
    for(const [index,brief] of ['Implement retry from donor retry.py','Ambil mekanisme dari file retry.ts lalu integrasikan','Review donor retry.go then implement the feature'].entries()){
      expect(await f.service.bind({...f.scope,taskId:'filename-donor-'+index},{brief,workflow:'direct'})).toMatchObject({craftRequired:true,dagRequired:true,planRequired:true});
    }
    expect(await f.service.bind({...f.scope,taskId:'filename-target'},{brief:'Implement retry in retry.py'})).toMatchObject({craftRequired:false,planRequired:true});
    expect(await f.service.bind({...f.scope,taskId:'filename-explanation'},{brief:'Explain donor retry.py'})).toMatchObject({craftRequired:false,planRequired:false});
  });
  it('rejects remote URL credentials and traversal before launching Git',async()=>{
    const f=await setup();
    await expect(f.service.bind(f.scope,{...f.bind,craft:{...f.bind.craft,donors:[{id:'donor',source:'https://token@example.com/repo.git'}]}})).rejects.toMatchObject({code:'WORKFLOW_INPUT_SENSITIVE'});
    await f.service.bind(f.scope,{...f.bind,craft:{...f.bind.craft,donors:[{id:'donor',source:'https://example.com/repo.git'}]}});
    await expect(f.service.source(f.scope,{operation:'read',role:'donor',donorId:'donor',path:'../outside.ts'})).rejects.toMatchObject({code:'WORKFLOW_SOURCE_PATH_ESCAPE'});
  });
  it('rejects credential-bearing resumed input before saving provenance or changing the contract version',async()=>{
    const f=await setup(),before=await f.service.store.read(f.scope),sentinel='synthetic-only-sentinel';
    for(const input of [
      {brief:`Continue password=${sentinel}`},
      {brief:'Continue',context:`token=${sentinel}`},
      {...f.bind,craft:{...f.bind.craft,requirements:[{id:'retry',description:`api_key=${sentinel}`}]}},
      {...f.bind,craft:{...f.bind.craft,donors:[{id:'donor',source:`https://example.com/repo?token=${sentinel}`}]}},
    ])await expect(f.service.bind(f.scope,input)).rejects.toMatchObject({code:'WORKFLOW_INPUT_SENSITIVE'});
    expect(await f.service.store.read(f.scope)).toEqual(before);
    const bytes=await readFile(path.join(f.options.stateRoot,'workflow-contracts',workflowScopeId(f.scope)+'.json'),'utf8');
    expect(bytes).not.toContain(sentinel);
    await expect(f.service.bind({...f.scope,taskId:'new-sensitive-task'},{brief:`Build feature password=${sentinel}`})).rejects.toMatchObject({code:'WORKFLOW_INPUT_SENSITIVE'});
    expect(await f.service.store.read({...f.scope,taskId:'new-sensitive-task'})).toBeNull();
  });
  it('proves integration from runtime evidence and rejects old tested input hashes',async()=>{
    const f=await setup(),p=await planFixture(f);const plan=await f.service.submitPlan(f.scope,p.input);
    await f.service.assertExecution(f.scope,{operation:'execution_start',nodes:[{command:'node tests/check.mjs',stepIds:['check'],resources:{writes:[p.report]}}]});
    await writeFile(p.report,'{"passed":true}\n');
    const run:WorkflowRunEvidence={runId:'run-1',taskId:f.scope.taskId,state:'completed',verification:'verified',planHash:plan.plan!.hash,nodes:[{stepIds:['check'],state:'succeeded',verification:'verified',artifacts:[{path:p.report,sha256:workflowHash(await readFile(p.report)),verification:'verified'}],inputHashes:[{path:f.target,hash:workflowHash(await readFile(f.target))}]}]};
    await writeFile(f.target,'export const run = () => 3;\n');
    await expect(f.service.prepareCompletion(f.scope,{runs:[run]})).rejects.toMatchObject({code:'WORKFLOW_VERIFICATION_REQUIRED'});
    run.nodes[0]!.inputHashes![0]!.hash=workflowHash(await readFile(f.target));
    const verified=await f.service.prepareCompletion(f.scope,{runs:[run]});expect(verified!.phase).toBe('VERIFIED');
    const closed=await f.service.markClosed(f.scope,{checkpointId:'checkpoint-one'});expect(closed.phase).toBe('CLOSED');
    expect((await f.service.markClosed(f.scope,{checkpointId:'checkpoint-one'})).version).toBe(closed.version);
    await expect(f.service.authorize(f.scope,{toolName:'edit_file',path:f.target,stepId:'edit'})).rejects.toMatchObject({code:'WORKFLOW_CLOSED'});
  });
  it('rejects an unexpected missing target and unperformed planned absences',async()=>{
    const f=await setup(),p=await planFixture(f);await f.service.submitPlan(f.scope,p.input);
    await rm(f.target);
    await expect(f.service.prepareCompletion(f.scope,{runs:[]})).rejects.toMatchObject({code:'WORKFLOW_TARGET_MISSING'});
    const untouched=await setup(),q=await planFixture(untouched),missing=path.join(untouched.root,'never-created.ts');
    q.input.steps.push({id:'new-file',purpose:'Create required implementation file',kind:'edit',paths:[missing]});q.input.mappings![0]!.stepIds.push('new-file');q.input.mappings![0]!.targetPaths.push(missing);await untouched.service.submitPlan(untouched.scope,q.input);
    await expect(untouched.service.prepareCompletion(untouched.scope,{runs:[]})).rejects.toMatchObject({code:'WORKFLOW_TARGET_OPERATION_REQUIRED'});
  });
  it('does not mint proof for truncated content or source path escapes',async()=>{
    const f=await setup();
    await expect(f.service.source(f.scope,{operation:'read',role:'donor',donorId:'donor',path:'worker.py',maxBytes:2})).rejects.toMatchObject({code:'WORKFLOW_SOURCE_TRUNCATED'});
    expect((await f.service.status(f.scope))!.receipts).toHaveLength(0);
    await expect(f.service.source(f.scope,{operation:'read',role:'donor',donorId:'donor',path:f.target})).rejects.toMatchObject({code:'WORKFLOW_SOURCE_PATH_ESCAPE'});
  });
});
