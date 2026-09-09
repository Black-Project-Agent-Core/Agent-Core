import { mkdtemp } from 'node:fs/promises';
import os from 'node:os'; import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('Supabase second-memory config',()=>{
 it('is disabled by default and does not require credentials',async()=>{const root=await mkdtemp(path.join(os.tmpdir(),'ac-sb-config-'));const c=loadConfig({},root).memory.supabaseSecond;expect(c.enabled).toBe(false);expect(c.url).toBeNull();expect(c.publishableKey).toBeNull();});
 it('requires only project-local signing and encryption key files when enabled',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'ac-sb-config-on-'));
  const signing=path.join(root,'runtime','secrets','signing.pem'),enc=path.join(root,'runtime','secrets','enc.key');
  const c=loadConfig({AGENT_CORE_MEMORY_SUPABASE_SECOND_ENABLED:'true',AGENT_CORE_MEMORY_SUPABASE_URL:'https://example.supabase.co',AGENT_CORE_MEMORY_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_x',AGENT_CORE_MEMORY_SUPABASE_SIGNING_KEY_FILE:signing,AGENT_CORE_MEMORY_SUPABASE_ENCRYPTION_KEY_FILE:enc},root).memory.supabaseSecond;
  expect(c.enabled).toBe(true);expect(c.signingKeyFile).toBe(signing);expect(c.encryptionKeyFile).toBe(enc);
 });
 it('rejects enabled remote state whose signing key path escapes Agent Core',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'ac-sb-config-escape-'));
  expect(()=>loadConfig({AGENT_CORE_MEMORY_SUPABASE_SECOND_ENABLED:'true',AGENT_CORE_MEMORY_SUPABASE_URL:'https://example.supabase.co',AGENT_CORE_MEMORY_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_x',AGENT_CORE_MEMORY_SUPABASE_SIGNING_KEY_FILE:path.resolve(root,'..','signing.pem'),AGENT_CORE_MEMORY_SUPABASE_ENCRYPTION_KEY_FILE:path.join(root,'enc.key')},root)).toThrow('AGENT_CORE_MEMORY_SUPABASE_SIGNING_KEY_FILE must stay inside the Agent Core root');
 });
});
