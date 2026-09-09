import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import type { MemoryScope } from '../types.js';
import type { EncryptedMemoryPayload, MemoryRemoteCrypto } from '../remote-crypto.js';
import { atomicReplaceValidated } from './atomic-writer.js';
import type { FileNativeMemoryPaths } from './paths.js';

export interface FileSecondMemoryVersion {
  versionId:string;
  fileId:string;
  relativePath:string;
  contentHash:string;
  encryptedEnvelope:EncryptedMemoryPayload;
  createdAt:number;
}
export interface FileSecondMemoryHead {
  principalId:string;
  projectId:string;
  mirrorId:string;
  fileId:string;
  relativePath:string;
  currentVersionId:string;
  state:'active'|'tombstoned';
  contentHash:string;
  updatedAt:number;
  priorVersionId?:string;
}
export interface AppendFileVersionInput {
  principalId:string;projectId:string;mirrorId:string;fileId:string;relativePath:string;updatedAt:number;version:FileSecondMemoryVersion;
}
export interface TombstoneFileInput {
  principalId:string;projectId:string;mirrorId:string;fileId:string;relativePath:string;reason:string;deletedAt:number;retentionUntil:number;
}
export interface FileSecondMemoryTransport {
  appendVersion(input:AppendFileVersionInput):Promise<{applied:boolean;currentVersionId:string}>;
  tombstone(input:TombstoneFileInput):Promise<void>;
  getHead(input:{principalId:string;projectId:string;mirrorId:string;fileId:string}):Promise<FileSecondMemoryHead|null>;
  getVersion(input:{principalId:string;projectId:string;mirrorId:string;fileId:string;versionId:string}):Promise<FileSecondMemoryVersion|null>;
  upsertSyncState(input:{principalId:string;projectId:string;mirrorId:string;lastVersionId:string|null;logicalRootHash:string|null;updatedAt:number}):Promise<void>;
}
export interface SupabaseSecondMemoryOptions { mirrorId:string; retentionMs:number }
interface PendingAppend { schemaVersion:1;type:'append';input:AppendFileVersionInput;queuedAt:number }

function hashBytes(bytes:Uint8Array){return createHash('sha256').update(bytes).digest('hex');}
function safeRelative(value:string){const normalized=value.replaceAll('\\','/').replace(/^\/+/, '');if(!normalized||normalized.split('/').some(p=>!p||p==='.'||p==='..')||/^[A-Za-z]:/.test(normalized))throw new Error('MEMORY_SECOND_PATH_INVALID');return normalized;}
function scopeParts(scope:MemoryScope){if(!scope.principalId?.trim())throw new Error('MEMORY_SCOPE_REQUIRED');return{principalId:scope.principalId,projectId:scope.projectId??''};}
function aad(input:{principalId:string;projectId:string;mirrorId:string;fileId:string;versionId:string;relativePath:string;contentHash:string}){return ['agent-core-file-second-v1',input.principalId,input.projectId,input.mirrorId,input.fileId,input.versionId,input.relativePath,input.contentHash].join('|');}

export class SupabaseSecondMemory {
  constructor(readonly paths:FileNativeMemoryPaths,readonly crypto:MemoryRemoteCrypto,readonly transport:FileSecondMemoryTransport,readonly options:SupabaseSecondMemoryOptions){if(!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(options.mirrorId))throw new Error('MEMORY_SECOND_MIRROR_ID_INVALID');if(!Number.isFinite(options.retentionMs)||options.retentionMs<86400000)throw new Error('MEMORY_SECOND_RETENTION_INVALID');}

  async syncFile(input:{scope:MemoryScope;fileId:string;relativePath:string;bytes:Uint8Array;updatedAt:number},options:{updateSyncState?:boolean}={}){
    const scope=scopeParts(input.scope),relativePath=safeRelative(input.relativePath),contentHash=hashBytes(input.bytes),versionId=`fv_${createHash('sha256').update(`${input.fileId}\0${contentHash}`).digest('hex')}`;
    let encryptedEnvelope:EncryptedMemoryPayload|undefined;
    try{const existing=await this.transport.getVersion({...scope,mirrorId:this.options.mirrorId,fileId:input.fileId,versionId});if(existing){if(existing.fileId!==input.fileId||existing.relativePath!==relativePath||existing.contentHash!==contentHash)throw new Error('MEMORY_SECOND_VERSION_CONFLICT');encryptedEnvelope=existing.encryptedEnvelope;}}catch(error){if(error instanceof Error&&error.message==='MEMORY_SECOND_VERSION_CONFLICT')throw error;}
    encryptedEnvelope??=this.crypto.encrypt(input.bytes,aad({...scope,mirrorId:this.options.mirrorId,fileId:input.fileId,versionId,relativePath,contentHash}));
    const version:FileSecondMemoryVersion={versionId,fileId:input.fileId,relativePath,contentHash,encryptedEnvelope,createdAt:input.updatedAt};
    const remote:AppendFileVersionInput={...scope,mirrorId:this.options.mirrorId,fileId:input.fileId,relativePath,updatedAt:input.updatedAt,version};
    try{const result=await this.transport.appendVersion(remote);if(options.updateSyncState!==false)await this.transport.upsertSyncState({...scope,mirrorId:this.options.mirrorId,lastVersionId:result.currentVersionId,logicalRootHash:null,updatedAt:Date.now()});return{versionId,currentVersionId:result.currentVersionId,applied:result.applied};}
    catch(error){await this.queue({schemaVersion:1,type:'append',input:remote,queuedAt:Date.now()});throw error;}
  }

  async certifyScope(scope:MemoryScope,files:readonly {fileId:string;relativePath:string;bytes:Uint8Array;updatedAt:number}[]){
    const ordered=[...files].sort((a,b)=>a.relativePath.localeCompare(b.relativePath));
    const leaves:string[]=[];let lastVersionId:string|null=null;
    for(const file of ordered){const synced=await this.syncFile({scope,...file});lastVersionId=synced.currentVersionId;leaves.push(`${file.fileId}\0${safeRelative(file.relativePath)}\0${hashBytes(file.bytes)}`);}
    const logicalRootHash=createHash('sha256').update(leaves.join('\n'),'utf8').digest('hex');const scopeId=scopeParts(scope);
    await this.transport.upsertSyncState({...scopeId,mirrorId:this.options.mirrorId,lastVersionId,logicalRootHash,updatedAt:Date.now()});
    return{logicalRootHash,lastVersionId,fileCount:ordered.length};
  }
  async tombstoneFile(input:{scope:MemoryScope;fileId:string;relativePath:string;reason:string;deletedAt:number}){
    const scope=scopeParts(input.scope),relativePath=safeRelative(input.relativePath),head=await this.transport.getHead({...scope,mirrorId:this.options.mirrorId,fileId:input.fileId});if(!head)throw new Error('MEMORY_SECOND_HEAD_MISSING');
    await this.transport.tombstone({...scope,mirrorId:this.options.mirrorId,fileId:input.fileId,relativePath,reason:input.reason,deletedAt:input.deletedAt,retentionUntil:input.deletedAt+this.options.retentionMs});
  }

  async readRemoteFile(input:{scope:MemoryScope;fileId:string;expectedRelativePath?:string;expectedContentHash?:string}){
    const scope=scopeParts(input.scope),head=await this.transport.getHead({...scope,mirrorId:this.options.mirrorId,fileId:input.fileId});if(!head)throw new Error('MEMORY_SECOND_HEAD_MISSING');
    const versionId=head.state==='tombstoned'?(head.priorVersionId??head.currentVersionId):head.currentVersionId;
    const version=await this.transport.getVersion({...scope,mirrorId:this.options.mirrorId,fileId:input.fileId,versionId});if(!version)throw new Error('MEMORY_SECOND_VERSION_MISSING');
    if(version.versionId!==versionId||version.fileId!==head.fileId||version.relativePath!==head.relativePath||version.contentHash!==head.contentHash)throw new Error('MEMORY_SECOND_VERSION_STALE');
    if(input.expectedRelativePath&&safeRelative(input.expectedRelativePath)!==safeRelative(version.relativePath))throw new Error('MEMORY_SECOND_PATH_MISMATCH');
    if(input.expectedContentHash&&input.expectedContentHash!==version.contentHash)throw new Error('MEMORY_SECOND_HASH_MISMATCH');
    const plaintext=this.crypto.decrypt(version.encryptedEnvelope,aad({...scope,mirrorId:this.options.mirrorId,fileId:head.fileId,versionId:version.versionId,relativePath:version.relativePath,contentHash:version.contentHash}));
    if(hashBytes(plaintext)!==version.contentHash)throw new Error('MEMORY_SECOND_HASH_MISMATCH');
    return{bytes:Uint8Array.from(plaintext),relativePath:version.relativePath,versionId:version.versionId,contentHash:version.contentHash};
  }
  async recordSyncState(scopeInput:MemoryScope,lastVersionId:string|null,logicalRootHash:string|null){const scope=scopeParts(scopeInput);await this.transport.upsertSyncState({...scope,mirrorId:this.options.mirrorId,lastVersionId,logicalRootHash,updatedAt:Date.now()});}
  async restoreFile(input:{scope:MemoryScope;fileId:string;expectedRelativePath?:string;expectedContentHash?:string}){
    const remote=await this.readRemoteFile(input);const target=path.resolve(this.paths.vaultRoot,...safeRelative(remote.relativePath).split('/')),relative=path.relative(this.paths.vaultRoot,target);if(relative.startsWith('..')||path.isAbsolute(relative))throw new Error('MEMORY_SECOND_PATH_INVALID');
    const text=Buffer.from(remote.bytes).toString('utf8');if(!Buffer.from(text,'utf8').equals(Buffer.from(remote.bytes)))throw new Error('MEMORY_SECOND_CONTENT_INVALID');
    await atomicReplaceValidated(target,text,()=>{});return{relativePath:remote.relativePath,versionId:remote.versionId,contentHash:remote.contentHash};
  }

  async pending():Promise<PendingAppend[]>{await mkdir(this.paths.syncRoot,{recursive:true});const out:PendingAppend[]=[];for(const name of (await readdir(this.paths.syncRoot)).filter(n=>n.startsWith('pending-')&&n.endsWith('.json')).sort()){try{const record=JSON.parse(await readFile(path.join(this.paths.syncRoot,name),'utf8')) as PendingAppend;if(record.schemaVersion===1&&record.type==='append')out.push(record);}catch{/* isolate malformed queue item */}}return out;}
  async retryPending(){const records=await this.pending();let synced=0,failed=0;for(const record of records){const name=this.pendingName(record.input.version.versionId);try{await this.transport.appendVersion(record.input);await rm(path.join(this.paths.syncRoot,name),{force:true});synced++;}catch{failed++;}}return{synced,failed};}
  private pendingName(versionId:string){return `pending-${versionId.replace(/[^A-Za-z0-9._-]/g,'_')}.json`;}
  private async queue(record:PendingAppend){await mkdir(this.paths.syncRoot,{recursive:true});const target=path.join(this.paths.syncRoot,this.pendingName(record.input.version.versionId));await atomicReplaceValidated(target,JSON.stringify(record,null,2)+'\n',text=>{const p=JSON.parse(text);if(p.schemaVersion!==1||p.type!=='append')throw new Error('MEMORY_SECOND_PENDING_INVALID');});}
}

