import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { WorkflowService } from '../src/workflows/service.js';
const roots:string[]=[];const services:WorkflowService[]=[];
afterEach(async()=>{await Promise.all(services.splice(0).map(s=>s.close()));await Promise.all(roots.splice(0).map(r=>rm(r,{recursive:true,force:true})));});
async function setup(){const root=await mkdtemp(path.join(os.tmpdir(),'workflow-service-'));roots.push(root);await mkdir(path.join(root,'src'));await writeFile(path.join(root,'src/index.ts'),'export const value=1;');return root;}
async function until(check:()=>boolean){for(let i=0;i<100&&!check();i++)await new Promise(r=>setTimeout(r,20));expect(check()).toBe(true);}
describe('Workflows automatic source refresh',()=>{
 it('detects added and deleted source modules and updates relationships without a manual refresh',async()=>{
  const root=await setup();const service=new WorkflowService(root,{pollMs:30,debounceMs:20});services.push(service);service.start();
  await until(()=>service.snapshot().status==='ready');const initial=service.snapshot();
  expect(initial.checkedAt).toBeDefined();expect(initial.observedFingerprint).toBe(initial.fingerprint);
  await mkdir(path.join(root,'src/feature'));await writeFile(path.join(root,'src/feature/index.ts'),'export const added=true;');
  await writeFile(path.join(root,'src/index.ts'),"import {added} from './feature/index.js'; export {added};");
  await until(()=>service.snapshot().status==='ready'&&service.snapshot().sourceFiles===2);
  expect(service.snapshot().edges).toBe(1);expect(service.snapshot().fingerprint).not.toBe(initial.fingerprint);
  await rm(path.join(root,'src/feature'),{recursive:true});await writeFile(path.join(root,'src/index.ts'),'export const removed=true;');
  await until(()=>service.snapshot().status==='ready'&&service.snapshot().sourceFiles===1&&service.snapshot().edges===0);
 });
 it('initializes, debounces source changes, and ignores runtime data',async()=>{
  const root=await setup();let renders=0;
  const service=new WorkflowService(root,{pollMs:30,debounceMs:40,render:async()=>`<html>${++renders}</html>`});services.push(service);service.start();
  await until(()=>service.snapshot().status==='ready');const first=service.snapshot();
  await mkdir(path.join(root,'runtime'));await writeFile(path.join(root,'runtime/private.ts'),'secret');
  await new Promise(r=>setTimeout(r,100));expect(renders).toBe(1);
  await writeFile(path.join(root,'src/index.ts'),'export const value=2;');
  await until(()=>service.snapshot().fingerprint!==first.fingerprint&&service.snapshot().status==='ready');
  expect(renders).toBe(2);expect(service.snapshot().sourceFiles).toBe(1);
 });
 it('preserves last good HTML and marks it stale when render fails',async()=>{
  const root=await setup();let fail=false;
  const service=new WorkflowService(root,{pollMs:30,debounceMs:20,render:async()=>{if(fail)throw new Error('private absolute path');return '<html>good</html>';}});services.push(service);service.start();
  await until(()=>service.snapshot().status==='ready');fail=true;
  await writeFile(path.join(root,'src/index.ts'),'export const value=3;');
  await until(()=>service.snapshot().status==='stale'&&Boolean(service.snapshot().error));
  expect(service.snapshot().html).toBe('<html>good</html>');expect(service.snapshot().error).not.toContain('private absolute');
  fail=false;await until(()=>service.snapshot().status==='ready');
 });
 it('does not render again after disposal',async()=>{
  const root=await setup();let renders=0;const service=new WorkflowService(root,{pollMs:30,render:async()=>`${++renders}`});services.push(service);service.start();
  await until(()=>service.snapshot().status==='ready');await service.close();
  await writeFile(path.join(root,'src/index.ts'),'changed');await new Promise(r=>setTimeout(r,100));expect(renders).toBe(1);
 });
});
it('uses only the labelled packaged source snapshot when root src is absent',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'workflow-package-'));roots.push(root);await mkdir(path.join(root,'source/src'),{recursive:true});await writeFile(path.join(root,'source/src/index.ts'),'export const packaged=true;');
 const service=new WorkflowService(root,{pollMs:30,render:async()=>'<html>packaged</html>'});services.push(service);service.start();
 await until(()=>service.snapshot().status==='ready');expect(service.snapshot().sourceFiles).toBe(1);expect(service.snapshot().limitations.join(' ')).toContain('Packaged source snapshot');
});
it('reports unavailable source honestly instead of a ready empty map',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'workflow-empty-'));roots.push(root);const service=new WorkflowService(root,{pollMs:30,render:async()=>'<html>empty</html>'});services.push(service);service.start();
 await until(()=>service.snapshot().status==='error');expect(service.snapshot().html).toBeUndefined();expect(service.snapshot().error).toContain('source');
});
it('automatically replaces the real offline diagram after source bytes change',async()=>{
 const root=await setup();const service=new WorkflowService(root,{pollMs:30,debounceMs:20});services.push(service);service.start();
 await until(()=>service.snapshot().status==='ready');const first=service.snapshot();
 expect(first.html).toContain('agent-core-source-diagram 1');expect(first.html).toContain("connect-src 'none'");
 await writeFile(path.join(root,'src/index.ts'),'export const value=4;');
 await until(()=>service.snapshot().status==='ready'&&service.snapshot().fingerprint!==first.fingerprint);
 expect(service.snapshot().html).not.toBe(first.html);expect(service.snapshot().generatedAt).not.toBe(first.generatedAt);
},10000);
