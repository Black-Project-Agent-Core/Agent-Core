import path from 'node:path';
import type { WorkflowService, WorkflowScope, WorkflowPlanInput } from '../../src/workflow/service.js';
import { ENGINEERING_CHOICES, engineeringCallerId, engineeringLimitationId } from '../../src/workflow/engineering-policy.js';

/** Real fixture evidence acquisition; never replaces the product's authority with client assertions. */
export async function assessPlan(service: Pick<WorkflowService,'status'|'source'>, scope: WorkflowScope, input: WorkflowPlanInput): Promise<WorkflowPlanInput> {
  const record = (await service.status(scope))!;
  if (!record.engineering) return input;
  const paths = [...new Set(input.steps.flatMap(step => step.paths ?? []).map(p => path.resolve(record.targetRoot,p)))];
  const discover: any = await service.source(scope,{operation:'discover',role:'target',query:'implementation native caller source'});
  const entries = discover.receipt.data.inventory.entries as Array<{path:string}>;
  const analysisPaths = paths.length ? paths : entries.slice(0,1).map(e => e.path);
  const impact: any = await service.source(scope,{operation:'impact',role:'target',targetPaths:analysisPaths});
  const reads = new Map<string,string>();
  for (const entry of entries) {
    const result: any = await service.source(scope,{operation:'read',role:'target',path:entry.path,maxBytes:1024*1024});
    reads.set(entry.path.toLowerCase(),result.receipt.id);
  }
  const refs = [discover.receipt.id,impact.receipt.id,...reads.values()];
  input.assessment = {
    discoveryReceiptId:discover.receipt.id,impactReceiptId:impact.receipt.id,
    decisions:[{requirement:'Preserve fixture behavior through the scoped implementation seam',choice:'custom',reason:'Fixture deliberately supplies a small implementation to exercise workflow correctness',evidenceReceiptIds:refs,
      alternatives:ENGINEERING_CHOICES.slice(0,-1).map(choice => ({choice,conclusion:'not_applicable' as const,reason:'Inventory and fixture source establish the bounded test-specific behavior',evidenceReceiptIds:refs}))}],
    targets:paths.map(p => ({path:p,requirementIndexes:[0],reason:'Required by the fixture accepted step',evidenceReceiptIds:refs})),
    callerDispositions:impact.receipt.data.callers.map((caller:any) => ({callerId:engineeringCallerId(caller),disposition:'unchanged',reason:'Fixture retains the caller contract and verifies behavior',evidenceReceiptIds:refs})),
    limitations:impact.receipt.data.limitations.map((limit:any) => ({limitationId:engineeringLimitationId(limit),reason:'Scoped fixture source inspection and declared checks cover this limitation',checkIds:input.checks.map(c=>c.id),evidenceReceiptIds:refs})),
  };
  input.expectedVersion=(await service.status(scope))!.version;
  return input;
}

/** Establish the policy through the real submission gate, then acquire actual server evidence. */
export async function submitAssessedPlan(service: Pick<WorkflowService,'status'|'source'|'submitPlan'>, scope: WorkflowScope, input: WorkflowPlanInput) {
  if (!(await service.status(scope))!.engineering) {
    try { return await service.submitPlan(scope,input); }
    catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENGINEERING_ASSESSMENT_REQUIRED')) throw error; }
  }
  return service.submitPlan(scope,await assessPlan(service,scope,input));
}

/** Narrow real MCP adapter, useful when a service intentionally does not expose its internal WorkflowService. */
export function engineeringTransport(call: (name:string,args:Record<string,unknown>)=>Promise<any>, routeContextId:string): Pick<WorkflowService,'status'|'source'|'submitPlan'> {
  return {
    status: async () => call('workflow_status',{routeContextId}),
    source: async (_scope,input) => call('craft_source',{routeContextId,...input}),
    submitPlan: async (_scope,plan) => call('workflow_plan',{routeContextId,plan}),
  };
}

/** Scheduler fixtures accept exact diagnostic commands; unfinished checks do not claim task completion. */
export async function prepareExecutionPlan(service: Pick<WorkflowService,'status'|'source'|'submitPlan'>, scope:WorkflowScope, nodes:any[], extraNodes:any[] = []):Promise<any[]> {
  const record=(await service.status(scope))!;
  const specs=[...nodes,...extraNodes];
  const artifactPaths=(node:any):string[] => node.expectedArtifacts?.length
    ? node.expectedArtifacts.map((artifact:any)=>artifact.path)
    : [path.join(record.targetRoot,'reports',`diagnostic-${node.id}.json`)];
  await submitAssessedPlan(service,scope,{expectedVersion:record.version,mappings:[],
    steps:specs.map(node=>({id:node.id,kind:'verification',purpose:node.purpose,command:node.command,paths:[]})),
    checks:specs.map(node=>({id:`check-${node.id}`,kind:'integration',purpose:'Preserve the diagnostic command and inspect its factual result before any eventual closure',stepIds:[node.id],requirementIds:[],artifactPaths:artifactPaths(node)})),
  });
  return nodes.map(node=>({...node,stepIds:[node.id],inputs:node.inputs??[],
    resources:{reads:[],...node.resources,writes:artifactPaths(node)}}));
}
export async function acceptCurrentReview(service:WorkflowService,scope:WorkflowScope):Promise<void> {
  const record=(await service.status(scope))!; if(!record.engineering)return;
  const result:any=await service.source(scope,{operation:'review',role:'target'});
  await service.submitReview(scope,{expectedVersion:result.version,reviewReceiptId:result.receipt.id,
    limitations:result.limitationIds?.map((limit:any)=>({limitationId:limit.id,reason:'Final scoped inspection and correctness checks cover this static-analysis limit',evidenceReceiptIds:[result.finalImpact.id],checkIds:record.plan!.checks.map(c=>c.id)})),
    dispositions:result.receipt.data.findings.map((finding:any)=>({findingId:finding.id,disposition:'retained',reason:'Fixture deliberately preserves this bounded construct to test behavior without changing its contract',evidenceReceiptIds:[result.receipt.id],checkIds:record.plan!.checks.map(c=>c.id)}))});
}
