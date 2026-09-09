import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import { atomicReplaceValidated } from '../memory/file-native/atomic-writer.js';
import { WorkflowError, workflowRecordSchema, type WorkflowRecord, type WorkflowScope } from './types.js';

export function workflowHash(value: string | Uint8Array): string { return createHash('sha256').update(value).digest('hex'); }
export function workflowScopeId(scope: WorkflowScope): string {
  if (![scope.principalId, scope.projectId, scope.taskId].every(v => typeof v === 'string' && v.trim())) throw new WorkflowError('WORKFLOW_SCOPE_REQUIRED', 'A scoped continuity task is required');
  return workflowHash(JSON.stringify([scope.principalId, scope.projectId, scope.taskId]));
}
export function validateWorkflowRecord(value: unknown): WorkflowRecord {
  const result = workflowRecordSchema.safeParse(value);
  if (!result.success) throw new WorkflowError('WORKFLOW_STATE_CORRUPT', 'Workflow record does not match its schema');
  const { stateHash, ...body } = result.data;
  if (workflowHash(JSON.stringify(body)) !== stateHash) throw new WorkflowError('WORKFLOW_STATE_CORRUPT', 'Workflow state hash does not match its contents');
  return result.data;
}
function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch (error) { return (error as NodeJS.ErrnoException).code !== 'ESRCH'; }
}
const queues = new Map<string, Promise<unknown>>();
export class WorkflowStore {
  readonly root: string;
  constructor(stateRoot: string, private readonly lockRoot: string) { this.root = path.resolve(stateRoot, 'workflow-contracts'); }
  private file(scope: WorkflowScope) { return path.join(this.root, `${workflowScopeId(scope)}.json`); }
  async read(scope: WorkflowScope): Promise<WorkflowRecord | null> {
    let value: string;
    try { value = await readFile(this.file(scope), 'utf8'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
    let record: WorkflowRecord;
    try { record = validateWorkflowRecord(JSON.parse(value)); }
    catch (error) { if (error instanceof WorkflowError) throw error; throw new WorkflowError('WORKFLOW_STATE_CORRUPT', 'Workflow state is not valid JSON'); }
    if (record.principalId !== scope.principalId || record.projectId !== scope.projectId || record.taskId !== scope.taskId) throw new WorkflowError('WORKFLOW_SCOPE_MISMATCH', 'Workflow record belongs to another scope');
    return record;
  }
  async update(scope: WorkflowScope, expectedVersion: number | undefined, operation: (record: WorkflowRecord | null) => Promise<WorkflowRecord> | WorkflowRecord): Promise<WorkflowRecord> {
    const key = this.file(scope), previous = queues.get(key) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(() => this.lock(scope, async () => {
      const current = await this.read(scope);
      if (expectedVersion !== undefined && current?.version !== expectedVersion) throw new WorkflowError('WORKFLOW_VERSION_CONFLICT', 'Workflow changed; reload its current version', { expectedVersion, actualVersion: current?.version ?? null });
      const result = await operation(current ? structuredClone(current) : null);
      if (result.principalId !== scope.principalId || result.projectId !== scope.projectId || result.taskId !== scope.taskId) throw new WorkflowError('WORKFLOW_SCOPE_MISMATCH', 'Cannot change workflow ownership');
      result.version = (current?.version ?? 0) + 1;
      const normalized = workflowRecordSchema.parse(result);
      const { stateHash: _, ...body } = normalized;
      normalized.stateHash = workflowHash(JSON.stringify(body));
      const text = JSON.stringify(normalized, null, 2) + '\n';
      await atomicReplaceValidated(key, text, candidate => { validateWorkflowRecord(JSON.parse(candidate)); });
      return structuredClone(normalized);
    }));
    queues.set(key, next);
    try { return await next; } finally { if (queues.get(key) === next) queues.delete(key); }
  }
  private async lock<T>(scope: WorkflowScope, operation: () => Promise<T>): Promise<T> {
    const directory = path.join(this.lockRoot, workflowScopeId(scope)); await mkdir(directory, { recursive:true });
    const root = await realpath(directory), token = randomUUID(), ticketPath = path.join(root, token + '.json');
    const deadline = Date.now() + 5000;
    type Ticket = { pid:number; token:string; number:number };
    const parse = (text:string):Ticket => {
      let value:Ticket; try { value=JSON.parse(text) as Ticket; } catch { throw new WorkflowError('WORKFLOW_LOCK_CORRUPT','Workflow lock ticket is malformed'); }
      if (!Number.isSafeInteger(value.pid)||value.pid<1||typeof value.token!=='string'||!Number.isSafeInteger(value.number)||value.number<0) throw new WorkflowError('WORKFLOW_LOCK_CORRUPT','Workflow lock ticket is malformed');
      return value;
    };
    const publish = async(number:number) => { await atomicReplaceValidated(ticketPath, JSON.stringify({pid:process.pid,token,number}), text=>{parse(text);}); };
    const tickets = async():Promise<Ticket[]> => {
      const records:Ticket[]=[];
      for (const name of await readdir(root)) {
        if (!name.endsWith('.json')) continue;
        let text:string;try{text=await readFile(path.join(root,name),'utf8');}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')continue;throw error;}
        const record=parse(text);if(name!==record.token+'.json')throw new WorkflowError('WORKFLOW_LOCK_CORRUPT','Workflow lock owner does not match its ticket');
        if(alive(record.pid))records.push(record);
      }
      return records;
    };
    // Publish the choosing phase before selecting a number. Later contenders observe our
    // ticket; simultaneous contenders break ties by token. No caller ever deletes another
    // caller's lock, and a process death is recovered by ignoring its abandoned ticket.
    await publish(0);
    try {
      const number=1+Math.max(0,...(await tickets()).map(t=>t.number));
      if(!Number.isSafeInteger(number))throw new WorkflowError('WORKFLOW_LOCK_CORRUPT','Workflow lock ticket overflow');
      await publish(number);
      while(true){
        const blocked=(await tickets()).some(t=>t.token!==token&&(t.number===0||t.number<number||(t.number===number&&t.token<token)));
        if(!blocked)break;
        if(Date.now()>deadline)throw new WorkflowError('WORKFLOW_LOCK_BUSY','Workflow state is being changed by another process');
        await new Promise(resolve=>setTimeout(resolve,15));
      }
      return await operation();
    } finally { await rm(ticketPath,{force:true}); }
  }
}
