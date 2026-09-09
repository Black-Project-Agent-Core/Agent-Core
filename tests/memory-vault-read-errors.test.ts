import { rm } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FileNativeMemoryRepository } from '../src/memory/file-native/vault-repository.js';
import { FileNativeMemoryRetriever } from '../src/memory/file-native/retriever.js';
import { GraphifyAdapter } from '../src/memory/file-native/graphify-adapter.js';
import { memoryConfig, memoryRoot } from './helpers/memory-fixture.js';

const failure=vi.hoisted(()=>({file:'',code:''}));
vi.mock('node:fs',async(importOriginal)=>{
  const original=await importOriginal<typeof import('node:fs')>();
  return{...original,stat:(...args:any[])=>{
    if(failure.code&&String(args[0])===failure.file){
      const callback=args.at(-1);queueMicrotask(()=>callback(Object.assign(new Error('fixture canonical stat failed'),{code:failure.code})));return;
    }
    return (original.stat as any)(...args);
  }};
});

const roots:string[]=[];
afterEach(async()=>{
  failure.file='';failure.code='';
  await Promise.all(roots.splice(0).map(root=>rm(root,{recursive:true,force:true,maxRetries:3})));
});

describe('canonical vault I/O failures',()=>{
  it.each(['EACCES','EPERM','EIO'])('propagates %s instead of reporting successful empty recall',async code=>{
    const root=await memoryRoot('vault-read-error');roots.push(root);
    const config=await memoryConfig(root),repo=new FileNativeMemoryRepository(config.fileNative),scope={principalId:'p',projectId:root};
    const saved=await repo.commit({scope,canonicalKey:'decision:read-error',kind:'decision',value:'Preserve the existing deployment decision.'});
    const snapshot=await repo.readSnapshot();
    failure.file=path.join(config.fileNative.vaultRoot,snapshot.byMemoryId.get(saved.memoryId)!);failure.code=code;
    await expect(repo.readSnapshot({verifyContent:true})).rejects.toMatchObject({code});
    await expect(new FileNativeMemoryRetriever(config.fileNative,{repository:repo}).search({scope,query:'deployment decision'})).rejects.toMatchObject({code});
    const graph=new GraphifyAdapter(config.fileNative,{pythonPath:'unused',bridgePath:'unused'});
    await expect(graph.update([])).rejects.toMatchObject({code});
    failure.code='';
    expect((await repo.getMemory(scope,saved.memoryId))?.valueText).toContain('existing deployment');
  });
});
