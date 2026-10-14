import {spawn,type ChildProcess} from 'node:child_process';import {existsSync} from 'node:fs';import {mkdtemp,readdir,readFile,realpath,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {setTimeout as delay} from 'node:timers/promises';import {pathToFileURL} from 'node:url';import {afterEach,expect,it} from 'vitest';
import {withOAuthProcessLock} from '../src/oauth/file-lock.js';

const roots:string[]=[];const children:ChildProcess[]=[];
afterEach(async()=>{
 for(const child of children.splice(0))if(child.exitCode===null)child.kill();
 for(const root of roots.splice(0)){
  // Nothing but the store and its lock may survive a test: no database, no leaked staging file.
  const stray=(await readdir(root,{recursive:true})).filter(name=>name!=='oauth.json'&&name!=='.oauth.lock');
  expect(stray).toEqual([]);
  await rm(root,{recursive:true,force:true});
 }
});

async function fixture(prefix:string){const root=await realpath(await mkdtemp(path.join(os.tmpdir(),prefix)));roots.push(root);return {root,file:path.join(root,'oauth.json'),lockPath:path.join(root,'.oauth.lock')};}

const holderSource=pathToFileURL(path.join(process.cwd(),'src','oauth','file-lock.ts')).href;
/** A genuinely separate Node process that takes the lock and keeps it until killed. */
async function startHolder(file:string):Promise<ChildProcess>{
 const code=`import {withOAuthProcessLock} from ${JSON.stringify(holderSource)};\nawait withOAuthProcessLock(${JSON.stringify(file)},async()=>{process.stdout.write('LOCKED\\n');await new Promise(r=>setTimeout(r,60000));});`;
 const child=spawn(process.execPath,['--input-type=module','-e',code],{stdio:['ignore','pipe','pipe']});children.push(child);
 let diagnostics='';child.stderr.on('data',chunk=>{diagnostics+=chunk;});
 await new Promise<void>((resolve,reject)=>{
  const timer=setTimeout(()=>reject(new Error(`lock holder did not start: ${diagnostics}`)),8000);
  child.stdout.once('data',()=>{clearTimeout(timer);resolve();});
  child.once('error',reject);
  child.once('exit',()=>{clearTimeout(timer);reject(new Error(`lock holder exited early: ${diagnostics}`));});
 });
 return child;
}

it('serializes two concurrent acquisitions inside one process',async()=>{
 const {file}=await fixture('agent-core-oauth-lock-serial-');
 let active=0,peak=0;const completed:string[]=[];
 const hold=(name:string)=>withOAuthProcessLock(file,async()=>{peak=Math.max(peak,++active);await delay(25);active--;completed.push(name);});
 await Promise.all([hold('first'),hold('second')]);
 expect(peak).toBe(1);
 expect(completed.sort()).toEqual(['first','second']);
});

it('excludes another process and reports OAUTH_STORE_BUSY once the timeout elapses',async()=>{
 const {file,lockPath}=await fixture('agent-core-oauth-lock-busy-');
 const child=await startHolder(file);
 expect(JSON.parse(await readFile(lockPath,'utf8')).pid).toBe(child.pid);
 await expect(withOAuthProcessLock(file,async()=>true,50)).rejects.toMatchObject({message:'OAuth store is busy in another process',code:'OAUTH_STORE_BUSY'});
 expect(JSON.parse(await readFile(lockPath,'utf8')).pid).toBe(child.pid);
});

it('recovers a lock abandoned by a dead owner process',async()=>{
 const {file,lockPath}=await fixture('agent-core-oauth-lock-stale-');
 const child=await startHolder(file);
 const exited=new Promise<void>(resolve=>child.once('exit',()=>resolve()));child.kill();await exited;
 expect(JSON.parse(await readFile(lockPath,'utf8')).pid).toBe(child.pid);
 expect(await withOAuthProcessLock(file,async()=>'recovered',1000)).toBe('recovered');
 expect(existsSync(lockPath)).toBe(false);
});

it('never admits two processes to the critical section at once',async()=>{
 const {root,file}=await fixture('agent-core-oauth-lock-exclusion-');
 const marker=JSON.stringify(path.join(root,'critical'));
 const start=Date.now()+400;
 const code=[
  `import {withOAuthProcessLock} from ${JSON.stringify(holderSource)};`,
  'import {open,rm} from "node:fs/promises";',
  `await new Promise(r=>setTimeout(r,Math.max(0,${start}-Date.now())));`,
  // An exclusive create inside the critical section: EEXIST means somebody else was already in it.
  `let overlaps=0;for(let i=0;i<20;i++){try{await withOAuthProcessLock(${JSON.stringify(file)},async()=>{await (await open(${marker},'wx')).close();await new Promise(r=>setTimeout(r,1));await rm(${marker},{force:true});});}catch(error){if(error.code!=='EEXIST')throw error;overlaps++;}}`,
  'process.stdout.write(String(overlaps));',
 ].join('\n');
 const overlaps=await Promise.all(Array.from({length:3},()=>new Promise<number>((resolve,reject)=>{
  const child=spawn(process.execPath,['--input-type=module','-e',code],{stdio:['ignore','pipe','pipe']});children.push(child);
  let out='',diagnostics='';child.stdout.on('data',chunk=>{out+=chunk;});child.stderr.on('data',chunk=>{diagnostics+=chunk;});
  child.once('error',reject);
  child.once('exit',status=>status===0?resolve(Number(out)):reject(new Error(`contender failed: ${diagnostics}`)));
 })));
 expect(overlaps).toEqual([0,0,0]);
},15000);

it('releases the lock after the operation throws',async()=>{
 const {file,lockPath}=await fixture('agent-core-oauth-lock-throw-');
 await expect(withOAuthProcessLock(file,async()=>{throw new Error('synthetic-operation-error');})).rejects.toThrow('synthetic-operation-error');
 expect(existsSync(lockPath)).toBe(false);
 expect(await withOAuthProcessLock(file,async()=>true)).toBe(true);
});
