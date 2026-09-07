import {spawn} from 'node:child_process';import {mkdtemp,rm} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {pathToFileURL} from 'node:url';import {afterEach,expect,it} from 'vitest';
import {withOAuthProcessLock} from '../src/oauth/file-lock.js';
const roots:string[]=[];afterEach(async()=>{for(const r of roots.splice(0))await rm(r,{recursive:true,force:true});});
it('releases a cross-process lock after owner process termination',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'agent-core-lock-release-'));roots.push(root);const file=path.join(root,'oauth.json');
 const url=pathToFileURL(path.join(process.cwd(),'dist','oauth','file-lock.js')).href;
 const code='import {withOAuthProcessLock} from '+JSON.stringify(url)+'; await withOAuthProcessLock('+JSON.stringify(file)+',async()=>{process.stdout.write("LOCKED\\n");await new Promise(r=>setTimeout(r,60000));});';
 const child=spawn(process.execPath,['--input-type=module','-e',code],{stdio:['ignore','pipe','pipe']});child.stderr.resume();
 try{
  await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('child readiness timeout')),3000);child.stdout.once('data',()=>{clearTimeout(timer);resolve();});child.once('error',reject);});
  await expect(withOAuthProcessLock(file,async()=>true,50)).rejects.toMatchObject({code:'OAUTH_STORE_BUSY'});
  const exit=new Promise<void>(resolve=>child.once('exit',()=>resolve()));child.kill();await exit;
  expect(await withOAuthProcessLock(file,async()=>true)).toBe(true);
 }finally{if(child.exitCode===null)child.kill();}
});
it('releases the lock after a callback failure',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'agent-core-lock-throw-'));roots.push(root);const file=path.join(root,'oauth.json');
 await expect(withOAuthProcessLock(file,async()=>{throw new Error('synthetic-operation-error');})).rejects.toThrow('synthetic-operation-error');
 expect(await withOAuthProcessLock(file,async()=>true)).toBe(true);
});
