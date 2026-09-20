import {createHash} from 'node:crypto';
import {createServer,type Server} from 'node:http';
import type {AddressInfo} from 'node:net';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {FileKeyStore} from '../src/auth/key-store.js';
import {createHttpHandler} from '../src/http/app.js';
import {HttpSecurityPolicy} from '../src/http/security-policy.js';
import {OAuthService} from '../src/oauth/service.js';
import {FileOAuthStore} from '../src/oauth/store.js';
const roots:string[]=[];const servers:Server[]=[];
async function setup(){
 const root=await mkdtemp(path.join(os.tmpdir(),'agent-core-exchange-review-'));roots.push(root);
 const keyStore=new FileKeyStore(root);const store=new FileOAuthStore(root);
 const key=await keyStore.create('synthetic-review-key');
 const client=await store.registerClient({clientName:'synthetic-client',redirectUris:['https://review.invalid/callback'],grantTypes:['authorization_code','refresh_token'],responseTypes:['code'],tokenEndpointAuthMethod:'client_secret_post'});
 const principal={clientId:client.client_id,resource:'https://review.invalid/mcp',scopes:['mcp:tools'],keyId:key.metadata.id,keyName:'synthetic-review-key'};
 const oauthService=new OAuthService(keyStore,store,new HttpSecurityPolicy({publicBaseUrl:'https://review.invalid',trustProxy:false,allowedOrigins:[]}));
 const server=createServer(createHttpHandler({keyStore,oauthService,auditLogger:{log:async()=>{}},mcpHandler:async(_req,res)=>{res.writeHead(200);res.end('{}');}}));
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));servers.push(server);
 const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
 const exchange=(fields:Record<string,string>)=>fetch(base+'/oauth/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:client.client_id,client_secret:client.client_secret,resource:principal.resource,...fields})});
 return {store,client,principal,exchange};
}
afterEach(async()=>{vi.restoreAllMocks();for(const s of servers.splice(0))await new Promise<void>(resolve=>s.close(()=>resolve()));for(const r of roots.splice(0))await rm(r,{recursive:true,force:true});});
function failWhenMinting(store:FileOAuthStore,existingTokens:number){
 // A deterministic I/O failure at the persistence boundary, never real credentials.
 const target=store as unknown as {save:(file:{accessTokens:unknown[]})=>Promise<void>};
 const save=target.save.bind(store);
 return vi.spyOn(target,'save').mockImplementation(async file=>{if(file.accessTokens.length>existingTokens)throw new Error('synthetic write failure');return save(file);});
}
describe('Atomic OAuth exchange regression',()=>{
 it('does not burn the refresh grant when saving its replacement fails',async()=>{
  const {store,principal,exchange}=await setup();const tokens=await store.issueTokens(principal);
  const spy=failWhenMinting(store,1);
  const res=await exchange({grant_type:'refresh_token',refresh_token:tokens.refreshToken});
  expect(res.status).toBe(500);await res.text();spy.mockRestore();
  expect(Boolean(await store.consumeRefreshToken(tokens.refreshToken,principal))).toBe(true);
 });
 it('does not burn the authorization code when saving issued tokens fails',async()=>{
  const {store,principal,exchange}=await setup();const verifier='a'.repeat(64);const redirectUri='https://review.invalid/callback';
  const code=await store.issueCode({...principal,redirectUri,codeChallenge:createHash('sha256').update(verifier).digest('base64url')});
  const spy=failWhenMinting(store,0);
  const res=await exchange({grant_type:'authorization_code',code,redirect_uri:redirectUri,code_verifier:verifier});
  expect(res.status).toBe(500);await res.text();spy.mockRestore();
  expect(Boolean(await store.consumeCode(code,{...principal,redirectUri,codeVerifier:verifier}))).toBe(true);
 });
 it('preserves both independent grants when two clients refresh concurrently',async()=>{
  const {store,principal,exchange}=await setup();const a=await store.issueTokens(principal);const b=await store.issueTokens(principal);
  const responses=await Promise.all([a,b].map(t=>exchange({grant_type:'refresh_token',refresh_token:t.refreshToken})));
  expect(responses.map(r=>r.status)).toEqual([200,200]);
  const results=await Promise.all(responses.map(r=>r.json()));
  const valid=await Promise.all(results.map(t=>store.verifyAccessToken(t.access_token)));
  expect(valid.filter(Boolean).length).toBe(2);
 });
});
