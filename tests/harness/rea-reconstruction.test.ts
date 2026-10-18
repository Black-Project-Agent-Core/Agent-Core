import {createHash} from 'node:crypto';
import {describe,it,expect} from 'vitest';
import type {TrackerEvent} from '../../src/tracker/activity-tracker.js';
import {HARNESS_LIMITS,parseManifest,type HarnessManifest,type HostProof,
  type HostScope,type ReceiptResolver} from '../../src/harness/reconstruction/contracts.js';
import {evaluateReconstructionHarness} from '../../src/harness/reconstruction/service.js';
import {resolveToolTerminals} from '../../src/harness/reconstruction/receipt-adapter.js';
const REF='tool:'+'a'.repeat(32);
const scope:HostScope={origin:'native',taskId:'task-1',workspace:'agent-core',processSessionId:'session-1'};
const proof:HostProof={ref:REF,tool:'read_file',authority:'tool-terminal',status:'pass',purpose:'tool-completion'};
const trusted:ReceiptResolver=()=>new Map([[REF,proof]]);
const EMPTY:ReceiptResolver=()=>new Map();
const base=():HarnessManifest=>({
  schemaVersion:1,coverage:'complete',
  claims:[{id:'claim.one',title:'A native read_file tool operation completed',kind:'tool-completion',
    requiredAuthority:'tool-terminal',obligationIds:['obl.one']}],
  obligations:[{id:'obl.one',claimId:'claim.one',required:true,ownerTool:'read_file',
    requiredCases:['positive'],dependsOn:[]}],
  selections:[{obligationId:'obl.one',caseKind:'positive',receiptRef:REF}],
  contradictions:[],
});
const check=(manifest:unknown,action='assess',resolver:ReceiptResolver=trusted)=>
  evaluateReconstructionHarness(action,manifest,scope,{resolver});
function event(overrides:Record<string,unknown>={}):TrackerEvent{
  return {id:'e1',kind:'tool-call',timestamp:'2026-10-17T08:00:00.000Z',
    source:'node',module:'MCP',level:'success',time:'08:00:00',message:'completed',
    context:{invocationId:'a'.repeat(32),tool:'read_file',outcome:'success',
      invocationSource:'mcp-wrapper',taskId:'task-1',
      processSessionId:'[REDACTED]',
      processInstanceDigest:'sha256:'+createHash('sha256').update('session-1').digest('hex'),...overrides},
  };
}
describe('REA-derived native reconstruction harness (isolated, no target execution)',()=>{
  it('H01: verifies only declared tool-completion with trusted terminal',async()=>{
    const report=await check(base());
    expect(report.status).toBe('ready');expect(report.summary.verified).toBe(1);
    expect(report.automaticApproval).toBe(false);expect(report.executesTarget).toBe(false);
    expect(report.memoryPersisted).toBe(false);
  });
  it('H02: missing case is open',async()=>{const m=base();m.selections=[];
    expect((await check(m)).status).toBe('open');});
  it('H02: missing claim obligation is unknown',async()=>{const m=base();m.obligations=[];
    expect((await check(m)).status).toBe('unknown');});
  it('H02: empty claims fail schema',()=>{const m=base();m.claims=[];
    expect(()=>parseManifest(m)).toThrow('HARNESS_INPUT_INVALID');});
  it('H03: duplicate semantic receipt identity fails schema',()=>{const m=base();m.selections.push(m.selections[0]!);
    expect(()=>parseManifest(m)).toThrow('HARNESS_INPUT_INVALID');});
  it('H03: invalid receipt ID rejected',()=>{const m=base();m.selections[0]!.receiptRef='tool:spoof';
    expect(()=>parseManifest(m)).toThrow('HARNESS_INPUT_INVALID');});
  it('H04: unknown or stale receipt cannot create READY',async()=>{
    expect((await check(base(),'assess',EMPTY)).status).toBe('unknown');
  });
  it('H05: tracker enforces native process/task identity',()=>{
    const old=Date.parse('2026-10-17T08:00:00.000Z')+100;
    expect(resolveToolTerminals([REF],scope,[event()],old).size).toBe(1);
    expect(resolveToolTerminals([REF],{...scope,taskId:'other'},[event()],old).size).toBe(0);
    expect(resolveToolTerminals([REF],{...scope,processSessionId:'other'},[event()],old).size).toBe(0);
  });
  it('H05: redactable raw process session never substitutes for host digest',()=>{
    const now=Date.parse('2026-10-17T08:00:00Z')+100;
    const missing=event({processSessionId:'session-1',processInstanceDigest:undefined});
    const forged=event({processSessionId:'session-1',processInstanceDigest:'sha256:'+'0'.repeat(64)});
    expect(resolveToolTerminals([REF],scope,[missing],now).size).toBe(0);
    expect(resolveToolTerminals([REF],scope,[forged],now).size).toBe(0);
  });
  it('H05: external receipt requires owner, workspace and attribution',()=>{
    const now=Date.parse('2026-10-17T08:00:00Z')+100;
    const ext:HostScope={taskId:'task-1',workspace:'agent-core',origin:'external',
      ownerId:'owner',workspaceIdentityKey:'w-key'};
    const fields={binding:'bound',ownerId:'owner',workspace:'agent-core',
      workspaceIdentityKey:'w-key',attributionStatus:'attributed'};
    expect(resolveToolTerminals([REF],ext,[event(fields)],now).size).toBe(1);
    expect(resolveToolTerminals([REF],ext,[event({...fields,ownerId:'bad'})],now).size).toBe(0);
    expect(resolveToolTerminals([REF],ext,[event({...fields,attributionStatus:'unbound'})],now).size).toBe(0);
  });
  it('H05: ambiguous duplicate terminal never passes',()=>{
    const now=Date.parse('2026-10-17T08:00:00Z')+100;
    expect(resolveToolTerminals([REF],scope,[event(),event()],now).size).toBe(0);
  });
  it('H06: static evidence cannot verify a behavior or stronger tier',async()=>{
    const m=base();m.claims[0]!.kind='behavior';m.claims[0]!.requiredAuthority='packaged-process';
    expect((await check(m)).status).toBe('unknown');
  });
  it('H07: missing leaf in dependency chain propagates uncertainty',async()=>{
    const m=base();m.obligations[0]!.dependsOn=['obl.missing'];
    expect((await check(m)).status).toBe('unknown');
  });
  it('H07: cyclic obligations do not become ready',async()=>{
    const m=base();m.claims[0]!.obligationIds.push('obl.two');
    m.obligations[0]!.dependsOn=['obl.two'];
    m.obligations.push({id:'obl.two',claimId:'claim.one',required:true,
      ownerTool:'read_file',requiredCases:['positive'],dependsOn:['obl.one']});
    expect((await check(m)).status).toBe('unknown');
  });
  it('H08: declared contradiction downgrades readiness',async()=>{
    const m=base();m.contradictions.push({obligationId:'obl.one',reasonCode:'source-conflict',evidenceRefs:['e1']});
    expect((await check(m)).status).toBe('unknown');
  });
  it('H09: partial inventory cannot be ready',async()=>{
    const m=base();m.coverage='partial';expect((await check(m)).status).toBe('unknown');
  });
  it('H10: caller cancellation blocks the read',async()=>{
    const ctrl=new AbortController();ctrl.abort();
    await expect(evaluateReconstructionHarness('assess',base(),scope,{resolver:trusted,signal:ctrl.signal}))
      .rejects.toThrow('HARNESS_CANCELLED');
  });
  it('H11: negative and teardown require their own semantic verifier',async()=>{
    const m=base();m.obligations[0]!.requiredCases=['positive','negative','teardown'];
    expect((await check(m)).status).toBe('open');
    m.selections.push({obligationId:'obl.one',caseKind:'negative',receiptRef:'tool:'+'b'.repeat(32)});
    expect((await check(m)).status).toBe('unknown');
  });
  it('H12: deterministic digest for duplicate inputs',async()=>{
    const a=await check(base()),b=await check(base());
    expect(a.reportDigest).toBe(b.reportDigest);expect(a.taskScopeDigest).toBe(b.taskScopeDigest);
  });
  it('H12: reordered independent required cases preserve report identity',async()=>{
    const a=base(),b=base();
    a.obligations[0]!.requiredCases=['negative','positive'];
    b.obligations[0]!.requiredCases=['positive','negative'];
    expect((await check(a)).reportDigest).toBe((await check(b)).reportDigest);
  });
  it('H13: input budget and strict unknown property are enforced',()=>{
    const m={...base(),extra:'x'.repeat(HARNESS_LIMITS.maxInputBytes+1)};
    expect(()=>parseManifest(m)).toThrow('HARNESS_INPUT_LIMIT');
    expect(()=>parseManifest({...base(),extra:'x'})).toThrow('HARNESS_INPUT_INVALID');
  });
  it('H14: absent trusted host identity blocks evaluation',async()=>{
    await expect(evaluateReconstructionHarness('assess',base(),{...scope,taskId:''},{resolver:trusted}))
      .rejects.toThrow('HARNESS_HOST_SCOPE_UNAVAILABLE');
  });
  it('H16: preview never authenticates evidence or declares readiness',async()=>{
    const preview=await check(base(),'preview',trusted);
    expect(preview.status).toBe('unknown');expect(preview.summary.verified).toBe(0);
    expect(preview.memoryPersisted).toBe(false);
  });
  it('H13: report is bounded at 64KiB',async()=>{
    const m=base(),report=await check(m);
    expect(Buffer.byteLength(JSON.stringify(report))).toBeLessThanOrEqual(HARNESS_LIMITS.maxReportBytes);
  });
});