import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { strictMemoryConfig, isolatedMemoryDependencies } from './helpers/memory-fixture.js';
import { MemoryService } from '../src/memory/service.js';
const roots:string[]=[]; afterEach(async()=>{await Promise.all(roots.splice(0).map(r=>rm(r,{recursive:true,force:true})));});
it('file-native explicit anchor is persisted and recalled even when absent from value text',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'ac-vault-anchor-'));roots.push(root);await mkdir(path.join(root,'.tools','ripgrep'),{recursive:true});await copyFile(path.join(process.cwd(),'.tools','ripgrep','rg.exe'),path.join(root,'.tools','ripgrep','rg.exe'));const config=await strictMemoryConfig(root);const service=new MemoryService(config,undefined,isolatedMemoryDependencies(config));const scope={principalId:'p1',projectId:root};
 const c=await service.commit({scope,canonicalKey:'memory.opaque.fact',kind:'decision',value:'opaque durable fact',sourceType:'test',explicitAnchors:[{type:'subject_alias',value:'phoenix-transit'}]});
 const result=await service.search({scope,query:'phoenix-transit'});expect(result.hits[0]?.memoryId).toBe(c.memoryId);expect(result.hits[0]?.whyMatched.matchedAnchors).toContain('phoenix-transit');await service.close();
});
