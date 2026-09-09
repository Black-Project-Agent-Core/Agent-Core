import { copyFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveFileNativeMemoryPaths } from '../src/memory/file-native/paths.js';
import { FileNativeMemoryRepository } from '../src/memory/file-native/vault-repository.js';
import { buildRecallProbes, RipgrepVaultSearch } from '../src/memory/file-native/ripgrep.js';
import { FileNativeMemoryRetriever } from '../src/memory/file-native/retriever.js';

const scope={principalId:'p1',projectId:'project'};
async function fixtureRoot(){
  const root=await mkdtemp(path.join(os.tmpdir(),'ac-recall-')); const paths=resolveFileNativeMemoryPaths(root);
  await mkdir(paths.ripgrepRoot,{recursive:true});
  const source=path.resolve('.tools','ripgrep',process.platform==='win32'?'rg.exe':'rg');
  await copyFile(source,path.join(paths.ripgrepRoot,process.platform==='win32'?'rg.exe':'rg'));
  return {root,paths};
}

describe('bundled-ripgrep file-native recall',()=>{
  it('extracts several narrow probes and returns only matching candidate Markdown files',async()=>{
    const {paths}=await fixtureRoot(); const repo=new FileNativeMemoryRepository(paths);
    await repo.commit({scope,canonicalKey:'coding:graphify-adapter',kind:'procedure',value:'Graphify adapter rebuilds relational memory locally.',metadata:{contextFamily:'coding',topicKey:'agent-core-memory'}});
    await repo.commit({scope,canonicalKey:'brainstorming:palette',kind:'observation',value:'Visual palette discussion unrelated to memory.',metadata:{contextFamily:'brainstorming',topicKey:'design'}});
    await mkdir(path.join(paths.vaultRoot,'General'),{recursive:true}); await writeFile(path.join(paths.vaultRoot,'General','malformed.md'),'not a vault file and no target phrase');
    const probes=buildRecallProbes('Continue Graphify memory adapter work');
    expect(probes.map(p=>p.term)).toEqual(expect.arrayContaining(['graphify','memory','adapter']));
    const candidates=await new RipgrepVaultSearch(paths).findCandidateFiles(probes);
    expect(candidates.some(c=>c.relativePath.includes('Coding/'))).toBe(true);
    expect(candidates.some(c=>c.relativePath.includes('malformed'))).toBe(false);
  });

  it('uses the project-local rg even when PATH cannot provide ripgrep',async()=>{
    const {paths}=await fixtureRoot(); const repo=new FileNativeMemoryRepository(paths);
    await repo.commit({scope,canonicalKey:'decision:portable-rg',kind:'decision',value:'Bundled ripgrep is mandatory.',metadata:{contextFamily:'decision',topicKey:'portable'}});
    const prior=process.env.PATH; process.env.PATH=path.join(paths.projectRoot,'empty-path');
    try { const c=await new RipgrepVaultSearch(paths).findCandidateFiles(buildRecallProbes('bundled ripgrep')); expect(c.length).toBeGreaterThan(0); }
    finally { process.env.PATH=prior; }
  });

  it('ranks valid entries deterministically and rejects malformed canonical files even outside the lexical candidates',async()=>{
    const {paths}=await fixtureRoot(); const repo=new FileNativeMemoryRepository(paths);
    const wanted=await repo.commit({scope,canonicalKey:'coding:graphify-memory',kind:'procedure',value:'Use Graphify as a rebuildable derived memory graph.',importance:.9,metadata:{contextFamily:'coding',topicKey:'memory'}});
    await repo.commit({scope,canonicalKey:'brainstorming:graphify-logo',kind:'observation',value:'Graphify logo brainstorming.',importance:.2,metadata:{contextFamily:'brainstorming',topicKey:'branding'}});
    const retriever=new FileNativeMemoryRetriever(paths,{itemBudget:4,characterBudget:2000});
    const result=await retriever.search({scope,query:'Graphify derived memory graph'});
    expect(result.hits[0]?.memoryId).toBe(wanted.memoryId);
    expect(result.hits[0]?.whyMatched.lexical).toBeGreaterThan(0);
    expect(result.hits[0]?.whyMatched.graph).toBe(0);
    await mkdir(path.join(paths.vaultRoot,'General'),{recursive:true}); await writeFile(path.join(paths.vaultRoot,'General','broken.md'),'---\nbroken: [\n---\nunrelated');
    await expect(retriever.search({scope,query:'Graphify derived memory graph'})).rejects.toThrow('MEMORY_VAULT_INVALID');
  });
});
