import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, it } from 'vitest';
import { MemoryLearningSink } from '../src/memory/learning-sink.js';
import { LearningSinkManager } from '../src/learning/sink-manager.js';
import { learning } from '../src/mcp/learning-schemas.js';
import { input, readJSON, report, temp } from './memory/evaluation/helpers/retrieval-report-fixtures.js';
it('different equal-delta experiments have stable distinct titles and candidate IDs',async()=>{
  const a=await report(),b=await report(input(undefined,undefined,{experimentId:'other-experiment'})),again=await report();
  for(const f of [a,b,again])expect(f.result.status,f.result.stderr).toBe(0);
  const candidates=await Promise.all([a,b,again].map(f=>readJSON(path.join(f.output,'review-candidate.json'))));
  const [x,y,z]=candidates;expect(x.title).not.toBe(y.title);expect(x.content).not.toBe(y.content);
  expect(x.candidateId).toMatch(/^retrieval-[a-f0-9]{64}$/);expect(x.candidateId).not.toBe(y.candidateId);
  expect(x.candidateId).toBe(z.candidateId);expect(x.title).toBe(z.title);expect(x.content).toBe(z.content);
  for(const c of candidates){expect(c.verified).toBe(false);expect(learning.safeParse({action:'review',candidates:[c]}).success).toBe(true);}
});
it('real isolated Memory retains distinct evaluations and preserves the first pointer on an exact rerun',async()=>{
  const {MemoryService}=await import('../src/memory/service.js');
  const base=await temp(),memoryRoot=path.join(base,'memory');await mkdir(memoryRoot);
  await writeFile(path.join(memoryRoot,'00-agent-core-memory.md'),'# Agent Core test foundation\nSynthetic isolated report test.\n');
  const memory=await MemoryService.initialize(base,memoryRoot);
  const manager=new LearningSinkManager([new MemoryLearningSink(memory as any)]);
  const first=await report(),second=await report(input(undefined,undefined,{experimentId:'different-experiment'}));
  const third=await report(input(undefined,[true,true,true,true])),again=await report();
  const [a,b,c,d]=await Promise.all([first,second,third,again].map(f=>readJSON(path.join(f.output,'review-candidate.json'))));
  const x=await manager.capture({...a,verified:true});expect(x.status).toBe('captured');
  const file=path.join(memoryRoot,'notes',x.id+'.md'),before=await readFile(file,'utf8');
  expect((await manager.capture({...b,verified:true})).status).toBe('captured');
  expect((await manager.capture({...c,verified:true})).status).toBe('captured');
  const repeat=await manager.capture({...d,verified:true});expect(repeat.status).toBe('duplicate');expect(repeat.id).toBe(x.id);
  expect(await readFile(file,'utf8')).toBe(before);expect(before).toContain(a.auditRef);
  expect((await memory.list()).length).toBe(4);
  const legacy={kind:'durable-fact' as const,title:'Legacy title',content:'Legacy first content',verified:true,evidenceRefs:['source:fixture']};
  expect((await manager.capture(legacy)).status).toBe('captured');
  expect((await manager.capture({...legacy,content:'Different legacy content'})).status).toBe('captured');
  expect((await manager.capture(legacy)).status).toBe('duplicate');
});
it('binds identity to each input, revision and implementation component',async()=>{
  const {reportIdentity}=await import('../scripts/memory/evaluation/report-bundle.mjs');
  const f=await report(),m=await readJSON(path.join(f.output,'report-manifest.json'));
  const binding={inputsDigest:m.inputsDigest,evaluatorRevision:m.evaluatorRevision,verifierRevision:m.verifierRevision,implementationHashes:m.implementationHashes};
  expect(reportIdentity(binding)).toBe(m.reportId);
  for(const key of ['inputsDigest','evaluatorRevision','verifierRevision']){
    const value=key==='inputsDigest'?'sha256:'+'0'.repeat(64):'different-v2';
    expect(reportIdentity({...binding,[key]:value})).not.toBe(m.reportId);
  }
  for(const key of Object.keys(binding.implementationHashes))
    expect(reportIdentity({...binding,implementationHashes:{...binding.implementationHashes,[key]:'sha256:'+'0'.repeat(64)}})).not.toBe(m.reportId);
  expect(reportIdentity({...binding,implementationHashes:Object.fromEntries(Object.entries(binding.implementationHashes).reverse())})).toBe(m.reportId);
});
