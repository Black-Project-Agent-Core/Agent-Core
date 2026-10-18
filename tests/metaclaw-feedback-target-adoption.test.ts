import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { MemoryService } from '../src/memory/service.js';
import { MemoryFeedbackStore } from '../src/memory/feedback.js';
import { resolveMemoryPaths, notePath } from '../src/memory/paths.js';
import { parseCanonicalNote, serializeCanonicalNote } from '../src/memory/note-format.js';
import { withMemoryProcessLock } from '../src/memory/lock.js';
import { registerMemoryTools } from '../src/memory/mcp/tools.js';
import { memoryFeedback } from '../src/memory/mcp/schemas.js';
const roots:string[]=[];
const digest=(r:{id:string;content:string})=>'sha256:'+createHash('sha256').update(JSON.stringify(['agent-core-memory-feedback-content/v1',r.id,r.content])).digest('hex');
async function fixture(){
  const root=await mkdtemp(path.join(os.tmpdir(),'metaclaw-feedback-'));roots.push(root);
  await mkdir(path.join(root,'notes'));await writeFile(path.join(root,'00-agent-core-memory.md'),'# Agent Core Fixture foundation\n');
  const memory=await MemoryService.initialize(root,root);
  if(memory.health().status==='error')throw new Error(JSON.stringify(memory.getIssues()));
  const record=await memory.remember({content:'Original body Unicode Ω 日本語',title:'Fixture',keywords:['fixture'],context:'test',tags:['test']});
  const paths=resolveMemoryPaths(root,root), canonical=notePath(paths,record.id);
  const feedback=path.join(paths.state,'feedback.json');
  const calls=new Map<string,any>();
  registerMemoryTools({registerTool:(name:string,config:any,call:any)=>calls.set(name,{config,call})} as any,memory);
  return {root,memory,record,paths,canonical,feedback,calls};
}
afterEach(async()=>{vi.restoreAllMocks();for(const root of roots.splice(0))await rm(root,{recursive:true,force:true});});
const readJSON=async(p:string)=>JSON.parse(await readFile(p,'utf8'));
const maybeRead=async(p:string)=>readFile(p,'utf8').catch((e:any)=>{if(e.code==='ENOENT')return null;throw e;});
it('exposes a body-only digest from the actual non-pinned MCP read; no persistence',async()=>{
  const f=await fixture(),r=await f.calls.get('memory_read').call({id:f.record.id});
  const body=JSON.parse(r.content[0].text);
  expect(body.feedbackTargetDigest).toBe(digest(body));
  expect(await readFile(f.canonical,'utf8')).not.toContain('feedbackTargetDigest');
  const pinned=JSON.parse((await f.calls.get('memory_read').call({id:'agent-core-foundational'})).content[0].text);
  expect(pinned.feedbackTargetDigest).toBeUndefined();
});
it('accepts matching guarded feedback and persists its binding without changing canonical content',async()=>{
  const f=await fixture(),before=await readFile(f.canonical,'utf8'),d=digest(f.record);
  const r=await (f.memory.feedback as any)(f.record.id,'same-body','helpful',d);
  expect(r).toMatchObject({duplicate:false,salience:1.25,contentDigest:d});
  expect((await readJSON(f.feedback)).records[0].events[0].contentDigest).toBe(d);
  expect(await readFile(f.canonical,'utf8')).toBe(before);
});
for(const kind of ['helpful','not-helpful','stale','wrong'])it(`refuses delayed ${kind} feedback after body replacement without any feedback write`,async()=>{
  const f=await fixture(),d=digest(f.record);await f.memory.update(f.record.id,{content:'Replacement body'});
  const before=await readFile(f.canonical,'utf8'),prior=await maybeRead(f.feedback);
  await expect((f.memory.feedback as any)(f.record.id,'old-body',kind,d)).rejects.toThrow('MEMORY_FEEDBACK_CONTENT_CHANGED');
  expect(await readFile(f.canonical,'utf8')).toBe(before);expect(await maybeRead(f.feedback)).toBe(prior);
});
it('ignores metadata and recall-only changes for body identity',async()=>{
  const f=await fixture(),d=digest(f.record);await f.memory.update(f.record.id,{title:'New title',tags:['updated']});await f.memory.read(f.record.id,true);
  expect(await (f.memory.feedback as any)(f.record.id,'metadata-only','helpful',d)).toMatchObject({contentDigest:d});
});
it('keeps legacy feedback unbound and idempotent',async()=>{
  const f=await fixture();await f.memory.feedback(f.record.id,'legacy','helpful');
  expect(await f.memory.feedback(f.record.id,'legacy','helpful')).toMatchObject({duplicate:true,salience:1.25});
  expect((await readJSON(f.feedback)).records[0].events[0].contentDigest).toBeUndefined();
});
it('does not reapply matching bound events; stale replay is rejected',async()=>{
  const f=await fixture(),d=digest(f.record);await (f.memory.feedback as any)(f.record.id,'bound','helpful',d);
  expect(await (f.memory.feedback as any)(f.record.id,'bound','helpful',d)).toMatchObject({duplicate:true,salience:1.25,contentDigest:d});
  await f.memory.update(f.record.id,{content:'Another body'});const before=await readFile(f.feedback,'utf8');
  await expect((f.memory.feedback as any)(f.record.id,'bound','helpful',d)).rejects.toThrow('MEMORY_FEEDBACK_CONTENT_CHANGED');
  await expect((f.memory.feedback as any)(f.record.id,'bound','helpful',digest((await f.memory.read(f.record.id,false))!))).rejects.toThrow('MEMORY_FEEDBACK_EVENT_CONFLICT');
  expect(await readFile(f.feedback,'utf8')).toBe(before);
});
it('cannot retroactively bind legacy events or change their kind',async()=>{
  const f=await fixture();await f.memory.feedback(f.record.id,'legacy','helpful');const before=await readFile(f.feedback,'utf8');
  await expect((f.memory.feedback as any)(f.record.id,'legacy','helpful',digest(f.record))).rejects.toThrow('MEMORY_FEEDBACK_EVENT_CONFLICT');
  await expect(f.memory.feedback(f.record.id,'legacy','wrong')).rejects.toThrow('MEMORY_FEEDBACK_EVENT_CONFLICT');
  expect(await readFile(f.feedback,'utf8')).toBe(before);
});
for(const bad of ['','sha256:ABC','sha256:'+'A'.repeat(64),'sha256:'+'a'.repeat(63),null,123])it(`refuses malformed expected digest ${String(bad).slice(0,12)}`,async()=>{
  const f=await fixture(),prior=await maybeRead(f.feedback);
  await expect((f.memory.feedback as any)(f.record.id,'bad-digest','helpful',bad)).rejects.toThrow('MEMORY_FEEDBACK_DIGEST_INVALID');
  expect(await maybeRead(f.feedback)).toBe(prior);
});
it('rejects pinned and absent targets',async()=>{
  const f=await fixture();await expect((f.memory.feedback as any)('agent-core-foundational','pinned','helpful',digest(f.record))).rejects.toThrow(/Pinned/);
  await expect((f.memory.feedback as any)('absent-id','absent','helpful',digest(f.record))).rejects.toThrow(/not found/);
});
it('checks the canonical body after acquiring the existing lock, not the service cache',async()=>{
  const f=await fixture(),d=digest(f.record),prior=await maybeRead(f.feedback);
  const original=MemoryFeedbackStore.prototype.apply;
  vi.spyOn(MemoryFeedbackStore.prototype,'apply').mockImplementationOnce(async function(this:MemoryFeedbackStore,...args:any[]){
    // Current reload also uses the process lock. Insert the competing writer
    // after reload, then queue the real feedback admission behind its lease.
    let pending!:ReturnType<MemoryFeedbackStore['apply']>;
    await withMemoryProcessLock(f.paths.lock,async()=>{
      pending=(original as any).apply(this,args);
      const r=parseCanonicalNote(await readFile(f.canonical,'utf8'));r.content='Cooperating concurrent writer';await writeFile(f.canonical,serializeCanonicalNote(r));
    });
    return pending;
  });
  await expect((f.memory.feedback as any)(f.record.id,'race','helpful',d)).rejects.toThrow('MEMORY_FEEDBACK_CONTENT_CHANGED');
  expect(await maybeRead(f.feedback)).toBe(prior);
});
it('actual MCP handlers parse/forward the guard and refuse lifecycle misuse',async()=>{
  const f=await fixture(),d=digest(f.record),call=f.calls.get('memory_feedback').call;
  expect(memoryFeedback.parse({id:f.record.id,eventId:'schema',kind:'helpful',expectedContentDigest:d})).toHaveProperty('expectedContentDigest',d);
  const ok=await call({id:f.record.id,eventId:'mcp',kind:'helpful',expectedContentDigest:d});expect(ok.isError).not.toBe(true);
  expect(JSON.parse(ok.content[0].text)).toHaveProperty('contentDigest',d);
  await f.memory.update(f.record.id,{content:'MCP updated body'});
  const no=await call({id:f.record.id,eventId:'stale',kind:'helpful',expectedContentDigest:d});expect(no.isError).toBe(true);expect(no.content[0].text).toContain('MEMORY_FEEDBACK_CONTENT_CHANGED');
  for(const kind of ['forget','restore']){const r=await call({id:f.record.id,eventId:kind,kind,expectedContentDigest:d});expect(r.isError).toBe(true);expect(r.content[0].text).toContain('MEMORY_FEEDBACK_GUARD_MODE_INVALID');}
});
it('digest helper exactly follows the versioned ID/body contract',async()=>{
  const sources=import.meta.glob('../src/memory/feedback-target.ts'),loader=sources['../src/memory/feedback-target.ts'];expect(loader).toBeTypeOf('function');
  const {memoryFeedbackContentDigest:fn}=await loader() as any;const a={id:'id-one',content:' body Ω\r\n'};
  expect(fn(a)).toBe(digest(a));expect(fn({...a,title:'new',retrievalCount:99})).toBe(fn(a));
  expect(fn({...a,content:a.content+' '})).not.toBe(fn(a));expect(fn({...a,id:'id-two'})).not.toBe(fn(a));
});

it('keeps accepted bindings across restart of an isolated Memory service',async()=>{
  const f=await fixture(),d=digest(f.record);await (f.memory.feedback as any)(f.record.id,'persisted','helpful',d);
  const reloaded=await MemoryService.initialize(f.root,f.root);
  expect(await (reloaded.feedback as any)(f.record.id,'persisted','helpful',d)).toMatchObject({duplicate:true,salience:1.25,contentDigest:d});
});
it('read binds the body actually returned even when canonical content changes during later advisory work',async()=>{
  const f=await fixture();vi.spyOn(f.memory,'staleness').mockImplementationOnce(async()=>{
    await f.memory.update(f.record.id,{content:'Changed during advisory call'});return {status:'source-unavailable'} as any;
  });
  const r=JSON.parse((await f.calls.get('memory_read').call({id:f.record.id})).content[0].text);
  expect(r.content).toBe(f.record.content);expect(r.feedbackTargetDigest).toBe(digest(r));
  const no=await f.calls.get('memory_feedback').call({id:f.record.id,eventId:'delayed-read',kind:'helpful',expectedContentDigest:r.feedbackTargetDigest});
  expect(no.isError).toBe(true);expect(no.content[0].text).toContain('MEMORY_FEEDBACK_CONTENT_CHANGED');
});
it('refuses a target removed after reload but before feedback lock admission',async()=>{
  const f=await fixture(),original=MemoryFeedbackStore.prototype.apply,prior=await maybeRead(f.feedback);
  vi.spyOn(MemoryFeedbackStore.prototype,'apply').mockImplementationOnce(async function(this:MemoryFeedbackStore,...args:any[]){
    await withMemoryProcessLock(f.paths.lock,async()=>{await rm(f.canonical);});return (original as any).apply(this,args);
  });
  await expect((f.memory.feedback as any)(f.record.id,'removed','helpful',digest(f.record))).rejects.toThrow('MEMORY_FEEDBACK_TARGET_MISSING');
  expect(await maybeRead(f.feedback)).toBe(prior);
});
it('rejects malformed persisted binding without rewriting the corrupted fixture',async()=>{
  const f=await fixture();await (f.memory.feedback as any)(f.record.id,'history','helpful',digest(f.record));
  const raw=await readJSON(f.feedback);raw.records[0].events[0].contentDigest='bad';await writeFile(f.feedback,JSON.stringify(raw));
  const before=await readFile(f.feedback,'utf8');
  await expect((f.memory.feedback as any)(f.record.id,'fresh','helpful',digest(f.record))).rejects.toThrow('MEMORY_FEEDBACK_STATE_DEGRADED');
  expect(await readFile(f.feedback,'utf8')).toBe(before);
});
