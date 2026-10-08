import path from 'node:path';
import * as fs from 'node:fs/promises';
import { describe, it, expect, vi, afterEach } from 'vitest';
const control=vi.hoisted(()=>({stamps:new Map<string,any>(),fail:new Set<string>(),active:0,maxActive:0,bytes:0,reads:0}));
vi.mock('node:fs/promises',async load=>{
 const actual:any=await load(); const stamp=(p:any,s:any,o:any)=>o?.bigint&&control.stamps.has(String(p).toLowerCase())?Object.assign(Object.create(Object.getPrototypeOf(s)),s,control.stamps.get(String(p).toLowerCase())):s;
 return {...actual,lstat:async(p:any,o:any)=>stamp(p,await actual.lstat(p,o),o),stat:async(p:any,o:any)=>stamp(p,await actual.stat(p,o),o),open:async(p:any,...args:any[])=>{
  const h=await actual.open(p,...args);return new Proxy(h,{get(target,key){
   if(key==='stat')return async(o:any)=>stamp(p,await target.stat(o),o);
   if(key==='read')return async(...a:any[])=>{control.reads++;control.active++;control.maxActive=Math.max(control.maxActive,control.active);try{await new Promise(r=>setImmediate(r));if(control.fail.has(String(p).toLowerCase()))throw Object.assign(new Error('private'),{code:'EIO'});const result=await target.read(...a);control.bytes+=result.bytesRead;return result;}finally{control.active--;}};
   const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
  }});
 }};
});
vi.mock('node:child_process',async()=>{const {EventEmitter}=await import('node:events');const {PassThrough}=await import('node:stream');return {spawn:()=>{const c:any=new EventEmitter();c.stdout=new PassThrough();c.stderr=new PassThrough();queueMicrotask(()=>c.emit('close',128));return c;}};});
import { WorkspaceFreshnessCoordinator } from '../src/semantic-ide/freshness.js';
import { scanWorkspaceSources } from '../src/semantic-ide/workspace-policy.js';
const roots:string[]=[];const definition={id:'typescript',extensions:['.ts'],languageIds:{'.ts':'typescript'},command:process.execPath,args:[]};
afterEach(async()=>{vi.restoreAllMocks();control.stamps.clear();control.fail.clear();control.active=0;control.maxActive=0;control.bytes=0;control.reads=0;await Promise.all(roots.splice(0).map(r=>fs.rm(r,{recursive:true,force:true})));});
async function fixture(text='AAAA'){const root=await fs.mkdtemp(path.resolve('runtime/tmp/stamp-'));roots.push(root);const file=path.join(root,'a.ts');await fs.writeFile(file,text);return {root,file};}
function harness(root:string){const changes:any[]=[];const session={notify:(_m:string,p:any)=>changes.push(...p.changes),bindCreatedFile:async()=>{},closeDeletedFile:async()=>{},noteFreshness:()=>{}};const c=new WorkspaceFreshnessCoordinator(100,100,5000,-1);return {c,session,changes,run:()=>c.reconcile(session,root,definition,[])};}
function frozen(file:string,ageMs=0){const now=BigInt(Date.now()-ageMs)*1000000n;control.stamps.set(file.toLowerCase(),{mtimeNs:now,ctimeNs:now});}
describe('PY7 stamp and bounded digest evidence',()=>{
 it('same-size rewrite with restored mtime emits one change',async()=>{const f=await fixture(),h=harness(f.root);await h.run();const old=await fs.stat(f.file);await fs.writeFile(f.file,'BBBB');await fs.utimes(f.file,old.atime,old.mtime);await h.run();await h.run();expect(h.changes.map(c=>c.type)).toEqual([2]);});
 it('coarse identical metadata cannot hide changed contents',async()=>{const f=await fixture(),h=harness(f.root);frozen(f.file);await h.run();await fs.writeFile(f.file,'BBBB');await h.run();expect(h.changes.map(c=>c.type)).toEqual([2]);});
 it('equal recent content is hashed again without false change',async()=>{const f=await fixture(),h=harness(f.root);frozen(f.file);await h.run();const reads=control.reads;const result=await h.run();expect(control.reads).toBeGreaterThan(reads);expect(result.state).toBe('fresh');expect(h.changes).toEqual([]);});
 it('exact identity strings retain inode precision and detect replacement',async()=>{const f=await fixture(),h=harness(f.root);frozen(f.file,5000);const stamp=control.stamps.get(f.file.toLowerCase());stamp.dev=1n;stamp.ino=9007199254740992n;await h.run();stamp.ino=9007199254740993n;const scan:any=await scanWorkspaceSources(f.root,['.ts']);expect(scan.files[0].identity.ino).toBe('9007199254740993');await h.run();expect(h.changes.map(c=>c.type)).toEqual([2]);});
 it('1.5-second stamps need digests; stable old metadata can be cached',async()=>{const f=await fixture();frozen(f.file,1500);const recent:any=await scanWorkspaceSources(f.root,['.ts']);expect(recent.files[0].evidence).toBe('digest');frozen(f.file,5000);const old:any=await scanWorkspaceSources(f.root,['.ts']);expect(old.files[0].evidence).toBe('metadata');});
 it('ambiguous oversized file stays unknown after wall time passes',async()=>{const f=await fixture('X'.repeat(1048577)),h=harness(f.root);frozen(f.file);expect((await h.run()).state).toBe('degraded');const now=Date.now();vi.spyOn(Date,'now').mockReturnValue(now+10000);expect((await h.run()).state).toBe('degraded');expect(h.changes).toEqual([]);expect(control.bytes).toBe(0);});
 it('read failure preserves old evidence without deletion',async()=>{const f=await fixture(),h=harness(f.root);frozen(f.file);await h.run();control.fail.add(f.file.toLowerCase());expect((await h.run()).state).toBe('degraded');expect(h.changes).toEqual([]);control.fail.clear();expect((await h.run()).state).toBe('fresh');});
 it('hash work respects the 8 MiB and four-reader limits',async()=>{const f=await fixture('X'.repeat(1048576));frozen(f.file);for(let i=1;i<10;i++){const p=path.join(f.root,i+'.ts');await fs.writeFile(p,'X'.repeat(1048576));frozen(p);}const scan:any=await scanWorkspaceSources(f.root,['.ts']);expect(scan.files).toHaveLength(10);expect(scan.files.filter((x:any)=>x.evidence==='unknown').length).toBeGreaterThanOrEqual(2);expect(control.bytes).toBeLessThanOrEqual(8*1048576);expect(control.maxActive).toBeLessThanOrEqual(4);expect(control.maxActive).toBeGreaterThan(0);});
 it('stable transition from digest uses a last reliable comparison',async()=>{const f=await fixture(),h=harness(f.root);frozen(f.file);await h.run();const reads=control.reads,now=Date.now();vi.spyOn(Date,'now').mockReturnValue(now+5000);expect((await h.run()).state).toBe('fresh');expect(control.reads).toBeGreaterThan(reads);const after=control.reads;await h.run();expect(control.reads).toBe(after);});
});
