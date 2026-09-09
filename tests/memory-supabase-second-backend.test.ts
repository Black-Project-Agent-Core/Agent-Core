import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { MemoryService } from '../src/memory/service.js';
import { memoryRuntimeFiles, isolatedMemoryDependencies } from './helpers/memory-fixture.js';
import type { AppendFileVersionInput, FileSecondMemoryHead, FileSecondMemoryTransport, FileSecondMemoryVersion, TombstoneFileInput } from '../src/memory/file-native/supabase-second-memory.js';

const roots:string[]=[];
class FakeSecond implements FileSecondMemoryTransport {
  versions = new Map<string,FileSecondMemoryVersion>(); heads = new Map<string,FileSecondMemoryHead>(); syncStates:any[]=[];
  async appendVersion(input:AppendFileVersionInput){this.versions.set(input.version.versionId,input.version);const prior=this.heads.get(input.fileId);this.heads.set(input.fileId,{principalId:input.principalId,projectId:input.projectId,mirrorId:input.mirrorId,fileId:input.fileId,relativePath:input.relativePath,currentVersionId:input.version.versionId,state:'active',contentHash:input.version.contentHash,updatedAt:input.updatedAt,...(prior?{priorVersionId:prior.currentVersionId}:{})});return{applied:!prior||prior.currentVersionId!==input.version.versionId,currentVersionId:input.version.versionId};}
  async tombstone(input:TombstoneFileInput){const h=this.heads.get(input.fileId);if(!h)throw new Error('missing');this.heads.set(input.fileId,{...h,state:'tombstoned',priorVersionId:h.currentVersionId,updatedAt:input.deletedAt});}
  async getHead(input:{fileId:string}){return this.heads.get(input.fileId)??null;}
  async getVersion(input:{versionId:string}){return this.versions.get(input.versionId)??null;}
  async upsertSyncState(input:any){this.syncStates.push(input);}
}

afterEach(async()=>{await Promise.all(roots.splice(0).map(r=>rm(r,{recursive:true,force:true})));});

describe('file-native backend Supabase second-memory integration',()=>{
  it('mirrors the complete durable vault after mutation and certifies a remote durability boundary from files alone',async()=>{
    const root=await mkdtemp(path.join(os.tmpdir(),'ac-second-backend-'));roots.push(root);await mkdir(path.join(root,'runtime','secrets'),{recursive:true});await writeFile(path.join(root,'runtime','secrets','signing.pem'),'unused-with-fake-transport');await writeFile(path.join(root,'runtime','secrets','enc.key'),Buffer.alloc(32,9));
    const config=loadConfig({AGENT_CORE_MEMORY_SUPABASE_SECOND_ENABLED:'true',AGENT_CORE_MEMORY_SUPABASE_URL:'https://example.supabase.co',AGENT_CORE_MEMORY_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',AGENT_CORE_MEMORY_SUPABASE_SIGNING_KEY_FILE:'runtime/secrets/signing.pem',AGENT_CORE_MEMORY_SUPABASE_ENCRYPTION_KEY_FILE:'runtime/secrets/enc.key'},root).memory;
    const remote=new FakeSecond();const service=new MemoryService(config,undefined,{...isolatedMemoryDependencies(config),fileSecondTransport:remote});const scope={principalId:'p1',projectId:root};
    const committed=await service.commit({scope,canonicalKey:'project:second-memory',kind:'decision',value:'canonical markdown survives',sourceType:'test'});
    expect(committed.memoryId).toBeTruthy();expect(remote.versions.size).toBeGreaterThanOrEqual(3);expect(remote.heads.size).toBeGreaterThanOrEqual(3);const mirroredPaths=[...remote.heads.values()].map(h=>h.relativePath);expect(mirroredPaths.some(p=>p.endsWith('.md')&&!p.startsWith('__agent_core__/'))).toBe(true);expect(mirroredPaths.some(p=>p.startsWith('.agent-core/events/'))).toBe(true);expect(mirroredPaths).toContain('__agent_core__/vault-manifest-v1.json');
    const boundary=await service.syncDurableBoundary(scope,'continuity_terminal');expect(boundary).toMatchObject({required:true,state:'REMOTE_SYNCED',reason:'continuity_terminal'});expect(remote.syncStates.at(-1)?.logicalRootHash).toMatch(/^[0-9a-f]{64}$/);
    const files=await memoryRuntimeFiles(root);expect(files.every(x=>/\.(md|json|jsonl|tmp)$/.test(x))).toBe(true);await service.close();
  });
});
