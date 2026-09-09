import { mkdir, mkdtemp, readFile, rm, stat, symlink, utimes, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VaultSegmentIndex, walkSegments } from '../src/memory/file-native/segment-index.js';
import { FileNativeMemoryRepository } from '../src/memory/file-native/vault-repository.js';
import { resolveFileNativeMemoryPaths } from '../src/memory/file-native/paths.js';
import { serializeVaultSegment } from '../src/memory/file-native/vault-codec.js';

const observations=vi.hoisted(()=>({parses:0,reads:[] as string[],directories:[] as Array<{file:string;recursive:boolean}>,blockedDirectory:'',blockedFile:''}));
vi.mock('node:fs/promises',async importOriginal=>{
  const actual=await importOriginal<typeof import('node:fs/promises')>();
  return{...actual,
    readdir:(...args:any[])=>{
      const file=String(args[0]);observations.directories.push({file,recursive:Boolean(args[1]?.recursive)});
      if(file===observations.blockedDirectory)return Promise.reject(Object.assign(new Error('fixture directory unavailable'),{code:'EACCES'}));
      return(actual.readdir as any)(...args);
    },
    readFile:(...args:any[])=>{
      const file=String(args[0]);observations.reads.push(file);
      if(file===observations.blockedFile)return Promise.reject(Object.assign(new Error('fixture canonical read unavailable'),{code:'EIO'}));
      return(actual.readFile as any)(...args);
    },
  };
});
vi.mock('../src/memory/file-native/vault-codec.js',async importOriginal=>{
  const actual=await importOriginal<typeof import('../src/memory/file-native/vault-codec.js')>();
  return{...actual,parseVaultSegment:(...args:Parameters<typeof actual.parseVaultSegment>)=>{observations.parses++;return actual.parseVaultSegment(...args);}};
});
const roots:string[]=[];
afterEach(async()=>{
  observations.parses=0;observations.reads=[];observations.directories=[];observations.blockedDirectory='';observations.blockedFile='';
  for(const root of roots.splice(0)){
    if(!root.startsWith(path.join(os.tmpdir(),'ac-index-validation-')))throw new Error('Unsafe fixture cleanup');
    await rm(root,{recursive:true,force:true,maxRetries:3});
  }
});
async function fixture(){
  const root=await mkdtemp(path.join(os.tmpdir(),'ac-index-validation-'));roots.push(root);
  const vault=path.join(root,'vault'),relativePath='Coding/project/alpha.md',file=path.join(vault,relativePath);
  await mkdir(path.dirname(file),{recursive:true});
  const text=serializeVaultSegment({schemaVersion:1,fileId:'alpha',relativePath,contextFamily:'coding',principalId:'principal',projectId:'project',topicKey:'alpha',segmentNo:1,createdAt:new Date(1).toISOString(),updatedAt:new Date(1).toISOString(),entries:[{
    memoryId:'memory-alpha',revisionId:'revision-alpha',revisionNo:1,canonicalKey:'decision:alpha',kind:'decision',state:'active',importance:0.5,pinned:false,enforcement:'soft',valueText:'Use policy A.',valueHash:'value-hash',createdAt:1,updatedAt:1,relations:[],
  }]});
  await writeFile(file,text);return{root,vault,relativePath,file,text,index:new VaultSegmentIndex(vault)};
}

describe('canonical segment content validation',()=>{
  it('does not cache bytes read after a snapshot under the previous content hash',async()=>{
    const f=await fixture();
    const repo=new FileNativeMemoryRepository({...resolveFileNativeMemoryPaths(f.root),vaultRoot:f.vault});
    const before=await repo.readSnapshot({verifyContent:true});
    await writeFile(f.file,f.text.replaceAll('policy A','policy B'));
    expect((await repo.readIndexedSegment(f.relativePath,before))?.entries[0]?.valueText).toBe('Use policy B.');
    await writeFile(f.file,f.text);
    const restored=await repo.readSnapshot({verifyContent:true});
    expect(restored.spines[0]!.contentHash).toBe(before.spines[0]!.contentHash);
    expect((await repo.readIndexedSegment(f.relativePath,restored))?.entries[0]?.valueText).toBe('Use policy A.');
  });
  it('rereads and hashes unchanged canonical bytes without reparsing the validated spine',async()=>{
    const f=await fixture(),first=await f.index.refresh({verifyContent:true});
    expect(observations.parses).toBe(1);observations.reads=[];
    expect(await f.index.refresh({verifyContent:true})).toBe(first);
    expect(observations.reads).toEqual([f.file]);expect(observations.parses).toBe(1);
    expect(first.spines[0]!.contentHash).toBe(createHash('sha256').update(f.text).digest('hex'));
  });
  it('updates metadata without parsing identical bytes or mutating an earlier snapshot',async()=>{
    const f=await fixture(),first=await f.index.refresh({verifyContent:true}),before=first.spines[0]!;
    const old=await stat(f.file);await utimes(f.file,old.atime,new Date(old.mtimeMs+3000));
    const next=await f.index.refresh({verifyContent:true}),current=await stat(f.file);
    expect(observations.parses).toBe(1);expect(next).not.toBe(first);expect(next.spines[0]).not.toBe(before);
    expect(next.spines[0]).toMatchObject({contentHash:before.contentHash,size:current.size,mtimeMs:current.mtimeMs,ctimeMs:current.ctimeMs});
    expect(first.spines[0]!.mtimeMs).toBe(old.mtimeMs);
  });
  it('detects changed equal-size bytes with restored mtime and reparses instead of using the old spine',async()=>{
    const f=await fixture(),stamp=new Date('2020-01-01T00:00:00.000Z');await utimes(f.file,stamp,stamp);
    const first=await f.index.refresh({verifyContent:true});
    const nextBytes=f.text.replaceAll('policy A','policy B');expect(Buffer.byteLength(nextBytes)).toBe(Buffer.byteLength(f.text));
    await writeFile(f.file,nextBytes);await utimes(f.file,stamp,stamp);
    const next=await f.index.refresh({verifyContent:true});
    expect(observations.parses).toBe(2);expect(next.spines[0]!.mtimeMs).toBe(first.spines[0]!.mtimeMs);
    expect(next.spines[0]!.contentHash).toBe(createHash('sha256').update(nextBytes).digest('hex'));
    expect(next.spines[0]!.contentHash).not.toBe(first.spines[0]!.contentHash);
  });
  it('reports new malformed bytes and read failures rather than reusing a previously valid spine',async()=>{
    const f=await fixture();await f.index.refresh({verifyContent:true});
    await writeFile(f.file,'invalid canonical Markdown');
    expect((await f.index.refresh({verifyContent:true})).malformedFiles).toEqual([{relativePath:f.relativePath,error:'MEMORY_VAULT_FRONTMATTER_INVALID'}]);
    await writeFile(f.file,f.text);
    expect((await f.index.refresh({verifyContent:true})).spines).toHaveLength(1);expect(observations.parses).toBe(3);
    observations.blockedFile=f.file;
    const failed=await f.index.refresh({verifyContent:true});expect(failed.spines).toEqual([]);expect(failed.malformedFiles[0]?.error).toBe('fixture canonical read unavailable');
    observations.blockedFile='';expect((await f.index.refresh({verifyContent:true})).spines).toHaveLength(1);expect(observations.parses).toBe(4);
  });
  it('prunes state before enumeration while preserving nested canonical Markdown and directory failures',async()=>{
    const f=await fixture(),excluded=path.join(f.vault,'.agent-core');await mkdir(path.join(excluded,'state','receipts'),{recursive:true});
    await writeFile(path.join(excluded,'state','receipts','unrelated.md'),'not a canonical segment');
    observations.blockedDirectory=excluded;observations.directories=[];
    expect(await walkSegments(f.vault)).toEqual([{file:f.file,relativePath:f.relativePath}]);
    expect(observations.directories.some(call=>call.recursive||call.file===excluded)).toBe(false);
    expect(observations.directories.map(call=>call.file)).toContain(path.dirname(f.file));
    observations.blockedDirectory=path.dirname(f.file);
    await expect(walkSegments(f.vault)).rejects.toMatchObject({code:'EACCES'});
  });
  it('does not traverse directory symlinks and sees newly added or removed canonical files',async()=>{
    const f=await fixture(),outside=path.join(f.root,'outside');await mkdir(outside);await writeFile(path.join(outside,'hidden.md'),'invalid');
    await symlink(outside,path.join(f.vault,'linked'),process.platform==='win32'?'junction':'dir');
    expect((await f.index.refresh({verifyContent:true})).malformedFiles).toEqual([]);
    const fresh=path.join(f.vault,'new.md');await writeFile(fresh,'invalid');
    expect((await f.index.refresh({verifyContent:true})).malformedFiles[0]?.relativePath).toBe('new.md');
    await rm(fresh);expect((await f.index.refresh({verifyContent:true})).malformedFiles).toEqual([]);
  });
});
