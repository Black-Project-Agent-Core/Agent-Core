import { expect, it } from 'vitest';

async function api(){ return import('../scripts/inspect/operation-completeness.mjs'); }
function row(kind:string,context:Record<string,unknown>,extra:Record<string,unknown>={}){
  return JSON.stringify({id:crypto.randomUUID(),timestamp:'2026-09-23T00:00:00.000Z',time:'00:00:00',module:'MCP',level:'info',message:kind,source:'node',kind,context,...extra});
}

it('pairs exact invocation ids and keeps unresolved evidence unknown',async()=>{
  const {summarizeOperationCompleteness}=await api();
  const common={tool:'read_file',invocationId:'inv-a',processSessionId:'proc-a'};
  const bytes=Buffer.from(row('tool-invocation-start',common)+'\n'+row('tool-call',{...common,outcome:'success'})+'\n'+
    row('tool-invocation-start',{tool:'write_file',invocationId:'inv-b',processSessionId:'proc-a'})+'\n');
  const r=summarizeOperationCompleteness(bytes);
  expect(r.inputComplete).toBe(true);
  expect(r.invocations.find((x:any)=>x.invocationId==='inv-a').status).toBe('success');
  expect(r.invocations.find((x:any)=>x.invocationId==='inv-b').status).toBe('terminal-unobserved');
  expect(r.fullyPaired).toBe(false);
});
it('marks malformed, unterminated and legacy rows without inventing history',async()=>{
  const {summarizeOperationCompleteness}=await api();
  const legacy=row('tool-call',{tool:'read_file'});
  const bytes=Buffer.from(legacy+'\n'+'{bad json}\n'+row('tool-call',{tool:'read_file',invocationId:'end-only',processSessionId:'proc-a',outcome:'success'}));
  const r=summarizeOperationCompleteness(bytes);
  expect(r.inputComplete).toBe(false);
  expect(r.finalLineTerminated).toBe(false);
  expect(r.malformedLines).toBe(1);
  expect(r.legacyUnpaired).toBe(1);
  expect(r.invocations.find((x:any)=>x.invocationId==='end-only').status).toBe('end-only');
});

it('reports duplicate boundaries as ambiguous instead of choosing one',async()=>{
  const {summarizeOperationCompleteness}=await api();
  const common={tool:'read_file',invocationId:'dup',processSessionId:'proc-a'};
  const bytes=Buffer.from([row('tool-invocation-start',common),row('tool-invocation-start',common),row('tool-call',{...common,outcome:'success'})].join('\n')+'\n');
  const r=summarizeOperationCompleteness(bytes);
  expect(r.invocations[0].status).toBe('ambiguous');
  expect(r.duplicateBoundaries).toBeGreaterThan(0);
});