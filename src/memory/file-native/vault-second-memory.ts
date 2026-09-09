import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import type { MemoryScope } from '../types.js';
import { atomicReplaceValidated } from './atomic-writer.js';
import type { FileNativeMemoryPaths } from './paths.js';
import { SupabaseSecondMemory } from './supabase-second-memory.js';
import { parseVaultSegment } from './vault-codec.js';

interface VaultSecondFile { fileId:string; relativePath:string; contentHash:string; bytes:number; updatedAt:number }
interface VaultSecondManifest { formatVersion:1; logicalRootHash:string; files:Array<Omit<VaultSecondFile,'updatedAt'>> }
interface VaultSecondIndex extends VaultSecondManifest { manifestVersionId:string }
const REMOTE_VAULT_PROJECT='agent-core://vault';
function sha(bytes:Uint8Array|string){return createHash('sha256').update(bytes).digest('hex');}
function fileId(relativePath:string){return `vf_${sha(relativePath).slice(0,48)}`;}
function safeRelative(value:string){const v=value.replaceAll('\\','/');if(!v||v.startsWith('/')||/^[A-Za-z]:/.test(v)||v.split('/').some(p=>!p||p==='.'||p==='..'))throw new Error('MEMORY_SECOND_PATH_INVALID');return v;}
function logicalRoot(files:readonly Omit<VaultSecondFile,'updatedAt'>[]){return sha([...files].sort((a,b)=>a.relativePath.localeCompare(b.relativePath)).map(f=>`${f.relativePath}\0${f.contentHash}\0${f.bytes}`).join('\n'));}
function physicalScope(scope:MemoryScope):MemoryScope {if(!scope.principalId?.trim())throw new Error('MEMORY_SCOPE_REQUIRED');return{principalId:scope.principalId,projectId:REMOTE_VAULT_PROJECT};}
function validateDurableFile(relativePath:string,bytes:Uint8Array){const text=Buffer.from(bytes).toString('utf8');if(!Buffer.from(text,'utf8').equals(Buffer.from(bytes)))throw new Error(`MEMORY_SECOND_CONTENT_INVALID:${relativePath}`);if(relativePath.startsWith('.agent-core/')){try{JSON.parse(text);}catch{throw new Error(`MEMORY_SECOND_CANONICAL_FILE_INVALID:${relativePath}`);}return;}if(relativePath.toLowerCase().endsWith('.md'))parseVaultSegment(text,relativePath);}
async function mapLimit<T,R>(items:readonly T[],limit:number,fn:(item:T)=>Promise<R>):Promise<R[]>{const out=new Array<R>(items.length);let cursor=0;const workers=Array.from({length:Math.min(Math.max(1,limit),Math.max(1,items.length))},async()=>{while(true){const i=cursor++;if(i>=items.length)return;out[i]=await fn(items[i]!);}});await Promise.all(workers);return out;}

export class VaultSecondMemoryCoordinator {
  static readonly MANIFEST_FILE_ID='__agent_core_vault_manifest_v1__';
  static readonly MANIFEST_PATH='__agent_core__/vault-manifest-v1.json';
  private readonly indexPath:string;
  constructor(readonly paths:FileNativeMemoryPaths,readonly second:SupabaseSecondMemory,readonly concurrency=12){this.indexPath=path.join(paths.syncRoot,'vault-second-index.json');}

  async readLocalIndex():Promise<VaultSecondIndex|null>{try{const parsed=JSON.parse(await readFile(this.indexPath,'utf8')) as VaultSecondIndex;this.validateManifest(parsed);if(typeof parsed.manifestVersionId!=='string'||!parsed.manifestVersionId)throw new Error('MEMORY_SECOND_INDEX_INVALID');return parsed;}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;if(error instanceof SyntaxError)throw new Error('MEMORY_SECOND_INDEX_INVALID');throw error;}}

  async sync(scopeInput:MemoryScope){
    const scope=physicalScope(scopeInput),current=await this.inventory(),previous=await this.readLocalIndex();
    if(previous){const currentPaths=new Set(current.map(f=>f.relativePath));const missing=previous.files.filter(f=>!currentPaths.has(f.relativePath));if(missing.length)throw new Error(`MEMORY_SECOND_LOCAL_FILE_MISSING:${missing[0]!.relativePath}`);}
    const previousByPath=new Map(previous?.files.map(f=>[f.relativePath,f])??[]);const changed=current.filter(f=>previousByPath.get(f.relativePath)?.contentHash!==f.contentHash);
    const rootHash=logicalRoot(current),manifest:VaultSecondManifest={formatVersion:1,logicalRootHash:rootHash,files:current.map(({updatedAt:_,...f})=>f)};
    const manifestBytes=Buffer.from(JSON.stringify(manifest,null,2)+'\n','utf8');
    let lastVersionId=previous?.manifestVersionId??null;
    if(changed.length){const synced=await mapLimit(changed,this.concurrency,async f=>this.second.syncFile({scope,fileId:f.fileId,relativePath:f.relativePath,bytes:await readBytes(this.paths.vaultRoot,f.relativePath),updatedAt:f.updatedAt},{updateSyncState:false}));lastVersionId=synced.at(-1)?.currentVersionId??lastVersionId;}
    const manifestChanged=!previous||previous.logicalRootHash!==rootHash;
    if(manifestChanged){const synced=await this.second.syncFile({scope,fileId:VaultSecondMemoryCoordinator.MANIFEST_FILE_ID,relativePath:VaultSecondMemoryCoordinator.MANIFEST_PATH,bytes:manifestBytes,updatedAt:Math.max(1,...current.map(f=>f.updatedAt))},{updateSyncState:false});lastVersionId=synced.currentVersionId;}
    const remoteManifest=await this.second.readRemoteFile({scope,fileId:VaultSecondMemoryCoordinator.MANIFEST_FILE_ID,expectedRelativePath:VaultSecondMemoryCoordinator.MANIFEST_PATH,expectedContentHash:sha(manifestBytes)});
    if(!Buffer.from(remoteManifest.bytes).equals(manifestBytes))throw new Error('MEMORY_SECOND_REMOTE_MANIFEST_MISMATCH');
    await this.second.recordSyncState(scope,lastVersionId,rootHash);
    const index:VaultSecondIndex={...manifest,manifestVersionId:remoteManifest.versionId};await this.writeIndex(index);
    return{logicalRootHash:rootHash,fileCount:current.length,changedFiles:changed.length,manifestVersionId:remoteManifest.versionId};
  }

  async restore(scopeInput:MemoryScope){
    const scope=physicalScope(scopeInput);const remote=await this.second.readRemoteFile({scope,fileId:VaultSecondMemoryCoordinator.MANIFEST_FILE_ID,expectedRelativePath:VaultSecondMemoryCoordinator.MANIFEST_PATH});
    let manifest:VaultSecondManifest;try{manifest=JSON.parse(Buffer.from(remote.bytes).toString('utf8')) as VaultSecondManifest;}catch{throw new Error('MEMORY_SECOND_MANIFEST_INVALID');}this.validateManifest(manifest);
    await mapLimit(manifest.files,this.concurrency,file=>this.second.restoreFile({scope,fileId:file.fileId,expectedRelativePath:file.relativePath,expectedContentHash:file.contentHash}));
    const restored=await this.inventory(),byPath=new Map(restored.map(f=>[f.relativePath,f]));for(const expected of manifest.files){const actual=byPath.get(expected.relativePath);if(!actual||actual.contentHash!==expected.contentHash||actual.bytes!==expected.bytes)throw new Error(`MEMORY_SECOND_RESTORE_VERIFY_FAILED:${expected.relativePath}`);}
    if(logicalRoot(manifest.files)!==manifest.logicalRootHash)throw new Error('MEMORY_SECOND_MANIFEST_HASH_INVALID');
    await this.writeIndex({...manifest,manifestVersionId:remote.versionId});return{logicalRootHash:manifest.logicalRootHash,fileCount:manifest.files.length,manifestVersionId:remote.versionId};
  }

  private validateManifest(value:VaultSecondManifest){if(value?.formatVersion!==1||!Array.isArray(value.files)||!/^([0-9a-f]{64})$/.test(value.logicalRootHash??''))throw new Error('MEMORY_SECOND_MANIFEST_INVALID');const seen=new Set<string>();for(const f of value.files){const rel=safeRelative(f.relativePath);if(f.fileId!==fileId(rel)||!/^[0-9a-f]{64}$/.test(f.contentHash)||!Number.isSafeInteger(f.bytes)||f.bytes<0||seen.has(rel))throw new Error('MEMORY_SECOND_MANIFEST_INVALID');seen.add(rel);}if(logicalRoot(value.files)!==value.logicalRootHash)throw new Error('MEMORY_SECOND_MANIFEST_HASH_INVALID');}
  private async writeIndex(index:VaultSecondIndex){await mkdir(this.paths.syncRoot,{recursive:true});await atomicReplaceValidated(this.indexPath,JSON.stringify(index,null,2)+'\n',text=>{const parsed=JSON.parse(text) as VaultSecondIndex;this.validateManifest(parsed);if(typeof parsed.manifestVersionId!=='string'||!parsed.manifestVersionId)throw new Error('MEMORY_SECOND_INDEX_INVALID');});}
  private async inventory():Promise<VaultSecondFile[]>{await mkdir(this.paths.vaultRoot,{recursive:true});const files=await walk(this.paths.vaultRoot),out:VaultSecondFile[]=[];for(const absolute of files.sort()){const relative=safeRelative(path.relative(this.paths.vaultRoot,absolute).replaceAll('\\','/'));if(relative.includes('/.')&&relative.endsWith('.tmp'))continue;const [bytes,info]=await Promise.all([readFile(absolute),stat(absolute)]);validateDurableFile(relative,bytes);out.push({fileId:fileId(relative),relativePath:relative,contentHash:sha(bytes),bytes:bytes.length,updatedAt:Math.max(1,Math.floor(info.mtimeMs))});}out.sort((a,b)=>a.relativePath.localeCompare(b.relativePath));return out;}
}
async function walk(root:string):Promise<string[]>{const out:string[]=[];for(const d of await readdir(root,{withFileTypes:true})){const p=path.join(root,d.name);if(d.isDirectory())out.push(...await walk(p));else if(d.isFile())out.push(p);}return out;}
async function readBytes(root:string,relative:string){return new Uint8Array(await readFile(path.join(root,...relative.split('/'))));}
