import { copyFile, mkdir, mkdtemp } from 'node:fs/promises';
import os from 'node:os'; import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveFileNativeMemoryPaths } from '../src/memory/file-native/paths.js';
import { FileNativeMemoryRepository } from '../src/memory/file-native/vault-repository.js';
import { FileNativeMemoryRetriever } from '../src/memory/file-native/retriever.js';

it('honors item and character recall budgets',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'ac-recall-budget-')); const paths=resolveFileNativeMemoryPaths(root); await mkdir(paths.ripgrepRoot,{recursive:true}); await copyFile(path.resolve('.tools','ripgrep',process.platform==='win32'?'rg.exe':'rg'),path.join(paths.ripgrepRoot,process.platform==='win32'?'rg.exe':'rg'));
 const repo=new FileNativeMemoryRepository(paths); const scope={principalId:'p',projectId:'project'};
 for(let i=0;i<8;i++) await repo.commit({scope,canonicalKey:`memory:item-${i}`,kind:'fact',value:`memory relevant ${i} ${'x'.repeat(120)}`,metadata:{contextFamily:'general',topicKey:'budget'}});
 const result=await new FileNativeMemoryRetriever(paths,{itemBudget:3,characterBudget:350}).search({scope,query:'memory relevant'});
 expect(result.hits.length).toBeLessThanOrEqual(3); expect(result.hits.reduce((n,h)=>n+h.valueText.length,0)).toBeLessThanOrEqual(350);
});
