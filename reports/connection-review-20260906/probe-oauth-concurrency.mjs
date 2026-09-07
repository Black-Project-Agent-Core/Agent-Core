import {mkdtemp,rm,writeFile} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {pathToFileURL} from 'node:url';
const modulePath=path.resolve(process.argv[2]??'dist/oauth/store.js');
const {FileOAuthStore}=await import(pathToFileURL(modulePath).href);
const rounds=[];const dirs=[];
try{for(let round=1;round<=3;round++){
 const dir=await mkdtemp(path.join(os.tmpdir(),'agent-core-oauth-probe-'));dirs.push(dir);const store=new FileOAuthStore(dir);
 const p={clientId:'synthetic-probe-client',resource:'https://probe.invalid/mcp',scopes:['mcp:tools'],keyId:'synthetic-probe-key',keyName:'synthetic-probe'};
 const tokens=await Promise.all(Array.from({length:8},()=>store.issueTokens(p)));
 const valid=await Promise.all(tokens.map(t=>store.verifyAccessToken(t.accessToken)));
 const t=await store.issueTokens(p);const consumed=await Promise.all(Array.from({length:2},()=>store.consumeRefreshToken(t.refreshToken,p)));
 rounds.push({round,tokensIssued:8,tokensStillValid:valid.filter(Boolean).length,sameRefreshAccepted:consumed.filter(Boolean).length});
}}finally{for(const dir of dirs)await rm(dir,{recursive:true,force:true});}
const result={capturedAt:new Date().toISOString(),modulePath,usesOnlySyntheticTempData:true,rounds,pass:rounds.every(r=>r.tokensStillValid===8&&r.sameRefreshAccepted===1)};
if(process.argv[3])await writeFile(process.argv[3],JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
process.exitCode=result.pass?0:1;