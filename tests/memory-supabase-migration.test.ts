import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, it } from 'vitest';

it('upgrades second memory to Ed25519 public-key verification while keeping the tested HMAC implementation internal-only',async()=>{
 const base=await readFile(path.resolve('supabase','migrations','20260907_file_native_second_memory.sql'),'utf8');
 const upgrade=await readFile(path.resolve('supabase','migrations','20260908_file_native_second_memory_ed25519.sql'),'utf8');
 for(const term of ['agent_core_private.memory_files','agent_core_private.memory_file_versions','agent_core_private.memory_tombstones','agent_core_private.memory_sync_state','joe_memory_second_call','security definer','auth_nonce','append_version','tombstone','get_head','get_version','upsert_sync_state'])expect(base.toLowerCase()).toContain(term.toLowerCase());
 for(const term of ['pgsodium','memory_auth_public_keys','crypto_sign_verify_detached','joe_memory_second_call_hmac_internal','revoke all on function public.joe_memory_second_call_hmac_internal'])expect(upgrade.toLowerCase()).toContain(term.toLowerCase());
 expect(upgrade).toMatch(/revoke\s+all[\s\S]*memory_auth_public_keys/i);
 expect(upgrade).toMatch(/grant\s+execute[\s\S]*joe_memory_second_call[\s\S]*anon/i);
 expect(upgrade).toMatch(/auth_sig[^\\n]*128/i);
});
