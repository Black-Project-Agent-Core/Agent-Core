import {spawn} from 'node:child_process';import {mkdtemp,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {afterEach,expect,it} from 'vitest';import {FileOAuthStore} from '../src/oauth/store.js';
const roots:string[]=[];afterEach(async()=>{for(const r of roots.splice(0))await rm(r,{recursive:true,force:true});});
it('retains 32 tokens issued by four independent Node processes',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'agent-core-process-'));roots.push(root);
 const url=pathToFileURL(path.join(process.cwd(),'dist','oauth','store.js')).href;
 const start=Date.now()+700;
 const code=[
  'import {FileOAuthStore} from '+JSON.stringify(url)+';',
  'const store=new FileOAuthStore('+JSON.stringify(root)+');',
  'await new Promise(r=>setTimeout(r,Math.max(0,'+start+'-Date.now())));',
  'const p={clientId:"synthetic-client",resource:"https://review.invalid/mcp",scopes:["mcp:tools"],keyId:"synthetic-key",keyName:"review"};',
  'const tokens=[];let failures=0;for(let i=0;i<8;i++){try{tokens.push((await store.issueTokens(p)).accessToken);}catch{failures++;}}',
  'process.stdout.write(JSON.stringify({tokens,failures}));'
 ].join('\n');
 const results=await Promise.all(Array.from({length:4},()=>new Promise<{tokens:string[],failures:number}>((resolve,reject)=>{
  const child=spawn(process.execPath,['--input-type=module','-e',code],{stdio:['ignore','pipe','pipe']});let out='';child.stdout.on('data',c=>out+=c);child.stderr.resume();child.once('error',reject);child.once('exit',code=>{if(code!==0)return reject(new Error('synthetic child failed'));try{resolve(JSON.parse(out));}catch{reject(new Error('invalid synthetic child output'));}});
 })));
 expect(results.reduce((n,r)=>n+r.failures,0)).toBe(0);
 const store=new FileOAuthStore(root);const tokens=results.flatMap(r=>r.tokens);const valid=await Promise.all(tokens.map(t=>store.verifyAccessToken(t)));
 expect(valid.filter(Boolean).length).toBe(32);
},15000);
