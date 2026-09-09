import { generateKeyPairSync, verify } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os'; import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SupabaseEd25519FileTransport } from '../src/memory/file-native/supabase-second-transport.js';

const priorFetch=globalThis.fetch;
afterEach(()=>{globalThis.fetch=priorFetch;vi.restoreAllMocks();});

describe('Supabase Ed25519 second-memory transport',()=>{
 it('signs the exact payload with a project-local private key while sending no shared secret',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'ac-sb-transport-'));
  const pair=generateKeyPairSync('ed25519');
  const keyFile=path.join(root,'signing-private.pem');
  await writeFile(keyFile,pair.privateKey.export({format:'pem',type:'pkcs8'}));
  let captured:any;
  globalThis.fetch=vi.fn(async(_url:any,init:any)=>{captured=JSON.parse(String(init.body));return new Response(JSON.stringify({applied:true,current_version_id:'fv_x'}),{status:200,headers:{'content-type':'application/json'}});}) as any;
  const transport=await SupabaseEd25519FileTransport.fromKeyFile({url:'https://example.supabase.co',publishableKey:'sb_publishable_test',signingKeyFile:keyFile,mirrorId:'canonical',timeoutMs:1000});
  const version:any={versionId:'fv_x',fileId:'mf_a',relativePath:'Coding/a.md',contentHash:'a'.repeat(64),encryptedEnvelope:{format:'agent-core-memory-aes256gcm-v1',nonce:'AA==',ciphertext:'',authTag:'AA==',plaintextHash:'a'.repeat(64)},createdAt:1};
  await transport.appendVersion({principalId:'p',projectId:'project',mirrorId:'canonical',fileId:'mf_a',relativePath:'Coding/a.md',updatedAt:1,version});
  expect(captured.operation).toBe('append_version');
  expect(typeof captured.payload_text).toBe('string');
  expect(captured.payload_text).toContain('"file_id":"mf_a"');
  expect(captured.auth_nonce).toMatch(/^[a-f0-9]{32}$/);
  expect(captured.auth_sig).toMatch(/^[a-f0-9]{128}$/);
  expect(captured.auth_secret).toBeUndefined();
  const message=Buffer.from(`${captured.auth_ts}\n${captured.auth_nonce}\n${captured.payload_text}`,'utf8');
  expect(verify(null,message,pair.publicKey,Buffer.from(captured.auth_sig,'hex'))).toBe(true);
 });
 it('maps 401/403 to an auth failure without exposing response bodies',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'ac-sb-auth-'));
  const pair=generateKeyPairSync('ed25519');
  const file=path.join(root,'signing-private.pem');
  await writeFile(file,pair.privateKey.export({format:'pem',type:'pkcs8'}));
  globalThis.fetch=vi.fn(async()=>new Response('secret server detail',{status:403})) as any;
  const t=await SupabaseEd25519FileTransport.fromKeyFile({url:'https://example.supaase.co',publishableKey:'sb_publishable_test',signingKeyFile:file,mirrorId:'canonical',timeoutMs:1000});
  await expect(t.getHead({principalId:'p',projectId:'x',mirrorId:'canonical',fileId:'m'})).rejects.toThrow('MEMORY_SECOND_AUTH_FAILED');
 });
});
