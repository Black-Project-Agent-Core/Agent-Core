import {mkdtemp,readFile,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {afterEach,expect,it,vi} from 'vitest';
const fault=vi.hoisted(()=>({renameFails:false}));
vi.mock('node:fs/promises',async original=>{const fs=await original<typeof import('node:fs/promises')>();return {...fs,rename:async(...args:Parameters<typeof fs.rename>)=>{if(fault.renameFails)throw Object.assign(new Error('synthetic blocked replace'),{code:'EPERM'});return fs.rename(...args);}};});
import {FileOAuthStore} from '../src/oauth/store.js';
const roots:string[]=[];afterEach(async()=>{fault.renameFails=false;for(const r of roots.splice(0))await rm(r,{recursive:true,force:true});});
it('rejects a failed rename without in-place overwrite of existing OAuth state',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'agent-core-atomic-'));roots.push(root);const store=new FileOAuthStore(root);
 const p={clientId:'synthetic-client',resource:'https://review.invalid/mcp',scopes:['mcp:tools'],keyId:'synthetic-key',keyName:'review'};
 await store.issueTokens(p);const before=await readFile(store.filePath,'utf8');fault.renameFails=true;
 let rejected=false;try{await store.issueTokens(p);}catch{rejected=true;}fault.renameFails=false;
 expect(rejected).toBe(true);expect((await readFile(store.filePath,'utf8'))===before).toBe(true);
});
