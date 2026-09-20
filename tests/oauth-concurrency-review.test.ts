import {createHash} from 'node:crypto';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {FileOAuthStore, type OAuthPrincipal} from '../src/oauth/store.js';
const dirs:string[]=[];
async function fixture(){const dir=await mkdtemp(path.join(os.tmpdir(),'agent-core-oauth-review-'));dirs.push(dir);return {dir,store:new FileOAuthStore(dir)};}
const principal:OAuthPrincipal={clientId:'synthetic-client',resource:'https://review.invalid/mcp',scopes:['mcp:tools'],keyId:'synthetic-key',keyName:'review'};
const clientInput={clientName:'synthetic-review',redirectUris:['https://review.invalid/callback'],grantTypes:['authorization_code','refresh_token'],responseTypes:['code'],tokenEndpointAuthMethod:'client_secret_post'};
afterEach(async()=>{for(const dir of dirs.splice(0))await rm(dir,{recursive:true,force:true});});
describe('OAuth file concurrency regression',()=>{
 it('retains every successfully issued token across eight concurrent requests',async()=>{
  const {store}=await fixture();
  const tokens=await Promise.all(Array.from({length:8},()=>store.issueTokens(principal)));
  const valid=await Promise.all(tokens.map(t=>store.verifyAccessToken(t.accessToken)));
  expect(valid.filter(Boolean).length).toBe(8);
 });
 it('serializes different store instances pointing at the same file',async()=>{
  const {store,dir}=await fixture();const other=new FileOAuthStore(path.join(dir,'.'));
  const registrations=await Promise.all(Array.from({length:8},(_,i)=>(i%2?store:other).registerClient(clientInput)));
  const valid=await Promise.all(registrations.map(c=>store.verifyClient(c.client_id,c.client_secret)));
  expect(valid.filter(Boolean).length).toBe(8);
 });
 it('permits exactly one simultaneous consumption of the same refresh token',async()=>{
  const {store}=await fixture();const t=await store.issueTokens(principal);
  const results=await Promise.all(Array.from({length:2},()=>store.consumeRefreshToken(t.refreshToken,principal)));
  expect(results.filter(Boolean).length).toBe(1);
 });
 it('permits exactly one simultaneous consumption of the same authorization code',async()=>{
  const {store}=await fixture();const verifier='a'.repeat(64);
  const redirectUri='https://review.invalid/callback';
  const code=await store.issueCode({...principal,redirectUri,codeChallenge:createHash('sha256').update(verifier).digest('base64url')});
  const input={...principal,redirectUri,codeVerifier:verifier};
  const results=await Promise.all(Array.from({length:2},()=>store.consumeCode(code,input)));
  expect(results.filter(Boolean).length).toBe(1);
 });
 it('continues processing after a failed operation rather than poisoning its queue',async()=>{
  const {store}=await fixture();await writeFile(store.filePath,'{invalid-json');
  await expect(store.issueTokens(principal)).rejects.toThrow();
  await rm(store.filePath);const t=await store.issueTokens(principal);
  expect(Boolean(await store.verifyAccessToken(t.accessToken))).toBe(true);
 });
 it('persists hashes without raw issued tokens and reopens from disk',async()=>{
  const {store,dir}=await fixture();const t=await store.issueTokens(principal);
  const raw=await readFile(store.filePath,'utf8');
  expect(raw.includes(t.accessToken)||raw.includes(t.refreshToken)).toBe(false);
  expect(Boolean(await new FileOAuthStore(dir).verifyAccessToken(t.accessToken))).toBe(true);
 });
});
