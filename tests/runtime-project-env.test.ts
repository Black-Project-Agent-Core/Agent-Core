import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig, loadRuntimeConfig, resolveRuntimeProjectRoot } from '../src/config.js';

const roots:string[]=[];
afterEach(async()=>{await Promise.all(roots.splice(0).map(root=>rm(root,{recursive:true,force:true})));});
async function fixture(){const root=await mkdtemp(path.join(os.tmpdir(),'ac-runtime-env-'));roots.push(root);await mkdir(path.join(root,'.tools','ripgrep'),{recursive:true});await writeFile(path.join(root,'.env'),[
 'AGENT_CORE_EXECUTION_LOCK_TIMEOUT_MS=7000',
 'AGENT_CORE_MEMORY_RG_PATH=.tools/ripgrep/rg.exe',
 'AGENT_CORE_MEMORY_SUPABASE_SECOND_ENABLED=false',
].join('\n')+'\n');return root;}

describe('project-local runtime environment',()=>{
 it('loads project .env for the executable runtime without changing loadConfig direct-call semantics',async()=>{const root=await fixture();expect(loadConfig({},root).execution.lockTimeoutMs).toBe(5_000);expect(loadConfig({},root).memory.fileNative.rgPath).toBeNull();const runtime=loadRuntimeConfig({},root);expect(runtime.execution.lockTimeoutMs).toBe(7_000);expect(runtime.memory.fileNative.rgPath).toBe(path.join(root,'.tools','ripgrep','rg.exe'));});
 it('keeps explicit process environment authoritative over project .env',async()=>{const root=await fixture();const runtime=loadRuntimeConfig({AGENT_CORE_EXECUTION_LOCK_TIMEOUT_MS:'1234'},root);expect(runtime.execution.lockTimeoutMs).toBe(1_234);});
 it('prefers AGENT_CORE_HOME over current working directory when resolving the portable runtime root',async()=>{const root=await fixture();expect(resolveRuntimeProjectRoot({AGENT_CORE_HOME:root},'C:\\unrelated')).toBe(path.resolve(root));expect(resolveRuntimeProjectRoot({},root)).toBe(path.resolve(root));});
 it('fails on malformed project .env instead of silently starting with persistence defaults',async()=>{const root=await fixture();await writeFile(path.join(root,'.env'),'AGENT_CORE_EXECUTION_LOCK_TIMEOUT_MS\n');expect(()=>loadRuntimeConfig({},root)).toThrow();});
});
