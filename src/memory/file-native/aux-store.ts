import { mkdir, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { atomicReplaceValidated } from './atomic-writer.js';
import type { FileNativeMemoryPaths } from './paths.js';
import { validateWorkflowProjectionDocument, type WorkflowProjectionCategory } from './workflow-projection.js';

function safe(value:string){return value.replace(/[^A-Za-z0-9._-]/g,'_');}
const structuredCategories=new Set<WorkflowProjectionCategory>([
  'lifecycles','continuity-tasks','continuity-turns','continuity-checkpoints','continuity-frontier','write-decisions',
]);
export class MemoryAuxReadError extends Error {
  constructor(readonly code:'MEMORY_AUX_RECORD_INVALID'|'MEMORY_AUX_READ_FAILED'|'MEMORY_AUX_DIRECTORY_READ_FAILED',readonly category:string,readonly recordId?:string,readonly causeCode?:string){
    super(code);this.name='MemoryAuxReadError';
  }
}
function ioCode(error:unknown):string|undefined{
  const code=(error as NodeJS.ErrnoException)?.code;
  return typeof code==='string'&&/^E[A-Z0-9_]+$/.test(code)?code:undefined;
}
function parseRecord<T>(category:string,id:string,text:string):T{
  try{
    const record:unknown=JSON.parse(text);
    if(record===null||typeof record!=='object')throw new Error('Invalid auxiliary record');
    if(structuredCategories.has(category as WorkflowProjectionCategory)){
      validateWorkflowProjectionDocument(category as WorkflowProjectionCategory,record);
      const local=record as Record<string,unknown>;
      // Local operational state must carry its scope before callers filter it.
      // Remote projection schemas also read legacy documents and are intentionally looser.
      if(typeof local.projectId!=='string')throw new Error('Missing operational project identity');
      if(category==='lifecycles'&&local.postflightState!=='CLOSED'&&typeof local.expiresAt!=='number')throw new Error('Missing operational lifecycle expiry');
    }
    // Validation must not project away operational expiry, timestamps or local durability receipts.
    return record as T;
  }catch{throw new MemoryAuxReadError('MEMORY_AUX_RECORD_INVALID',category,id);}
}
export class FileNativeAuxStore {
  readonly root:string;
  constructor(paths:FileNativeMemoryPaths){this.root=path.join(paths.vaultRoot,'.agent-core','state');}
  private file(category:string,id:string){return path.join(this.root,safe(category),`${safe(id)}.json`);}
  async put<T>(category:string,id:string,value:T):Promise<T>{const target=this.file(category,id);await mkdir(path.dirname(target),{recursive:true});const text=JSON.stringify(value,null,2)+'\n';await atomicReplaceValidated(target,text,c=>{const p=JSON.parse(c);if(p===null||typeof p!=='object')throw new Error('MEMORY_AUX_INVALID');});return value;}
  private async read<T>(category:string,id:string,missingAllowed:boolean,file=this.file(category,id)):Promise<T|null>{
    let text:string;
    try{text=await readFile(file,'utf8');}
    catch(error){const causeCode=ioCode(error);if(missingAllowed&&causeCode==='ENOENT')return null;throw new MemoryAuxReadError('MEMORY_AUX_READ_FAILED',category,id,causeCode);}
    return parseRecord<T>(category,id,text);
  }
  async get<T>(category:string,id:string):Promise<T|null>{return this.read<T>(safe(category),safe(id),true);}
  async list<T>(category:string):Promise<T[]>{
    category=safe(category);const dir=path.join(this.root,category);let names:string[];
    try{names=await readdir(dir);}
    catch(error){const causeCode=ioCode(error);if(causeCode==='ENOENT')return[];throw new MemoryAuxReadError('MEMORY_AUX_DIRECTORY_READ_FAILED',category,undefined,causeCode);}
    const out:T[]=[];
    // A record listed in this pass must remain readable; disappearance is not an empty category.
    for(const name of names.filter(n=>n.endsWith('.json')).sort())out.push((await this.read<T>(category,name.slice(0,-5),false,path.join(dir,name)))!);
    return out;
  }
  async delete(category:string,id:string):Promise<void>{await rm(this.file(category,id),{force:true});}
}
