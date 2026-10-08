import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as scanner from '../src/semantic-ide/workspace-policy.js';
import { WorkspaceFreshnessCoordinator } from '../src/semantic-ide/freshness.js';
const root = path.resolve('runtime/tmp/generation-fixture');
const definition = { id: 'typescript', extensions: ['.ts'], languageIds: { '.ts': 'typescript' }, command: process.execPath, args: [] };
function deferred<T>() { let resolve!: (v: T) => void; let reject!: (e: Error) => void; const promise = new Promise<T>((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; }
function result(names = ['a.ts'], mtime = 1): any { return { files: names.map(n=>({absolutePath:path.join(root,n),relativePath:n,mtimeMs:mtime,size:10,identity:{dev:'1',ino:String(n.charCodeAt(0)),mtimeNs:String(mtime*1000000),ctimeNs:'1',size:10},evidence:'metadata',cacheable:true})),complete:true,truncated:false,ioIssueCount:0,issues:[],durationMs:0,ignoredCount:0 }; }
function session() { return { notify:vi.fn(), bindCreatedFile:vi.fn(async()=>{}), closeDeletedFile:vi.fn(async()=>{}), noteFreshness:vi.fn() }; }
afterEach(()=>vi.restoreAllMocks());
describe('TS7-P2 generation ownership',()=>{
 it('clear(root) releases old ownership and cannot resurrect old baseline',async()=>{
  const scan=vi.spyOn(scanner,'scanWorkspaceSources'); const a=deferred<any>(), b=deferred<any>(); scan.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
  const c=new WorkspaceFreshnessCoordinator(100,100,5000,-1), sa=session(), sb=session();
  const old=c.reconcile(sa,root,definition,[]); c.clear(root); const next=c.reconcile(sb,root,definition,[]);
  expect(scan).toHaveBeenCalledTimes(2); b.resolve(result(['b.ts'])); expect((await next).state).toBe('baseline'); a.resolve(result());
  expect((await old).reason).toBe('SEMANTIC_FRESHNESS_SUPERSEDED'); expect(sa.noteFreshness).not.toHaveBeenCalled();
  scan.mockResolvedValue(result(['b.ts'])); expect((await c.reconcile(sb,root,definition,[])).eventCount).toBe(0);
 });
 it('different session does not join or reuse another session cache',async()=>{
  const scan=vi.spyOn(scanner,'scanWorkspaceSources').mockResolvedValue(result()); const c=new WorkspaceFreshnessCoordinator();
  await c.reconcile(session(),root,definition,[]); await c.reconcile(session(),root,definition,[]); expect(scan).toHaveBeenCalledTimes(2);
 });
 it('same session calls share one pending scan and recent result',async()=>{
  const a=deferred<any>(); const scan=vi.spyOn(scanner,'scanWorkspaceSources').mockReturnValue(a.promise); const c=new WorkspaceFreshnessCoordinator(), s=session();
  const one=c.reconcile(s,root,definition,[]), two=c.reconcile(s,root,definition,[]); a.resolve(result()); await Promise.all([one,two]); await c.reconcile(s,root,definition,[]); expect(scan).toHaveBeenCalledTimes(1);
 });
 it('old rejection cannot clear the new pending owner',async()=>{
  const scan=vi.spyOn(scanner,'scanWorkspaceSources'); const a=deferred<any>(), b=deferred<any>(); scan.mockReturnValueOnce(a.promise).mockReturnValue(b.promise);
  const c=new WorkspaceFreshnessCoordinator(100,100,5000,-1), sa=session(), sb=session(); const old=c.reconcile(sa,root,definition,[]); c.clear();
  const next=c.reconcile(sb,root,definition,[]); a.reject(new Error('old failure')); expect((await old).reason).toBe('SEMANTIC_FRESHNESS_SUPERSEDED');
  const joined=c.reconcile(sb,root,definition,[]); expect(scan).toHaveBeenCalledTimes(2); b.resolve(result()); await Promise.all([next,joined]); expect(sa.noteFreshness).not.toHaveBeenCalled();
 });
 it('invalidated scan sends no watched-file or close notification',async()=>{
  const scan=vi.spyOn(scanner,'scanWorkspaceSources').mockResolvedValue(result(['a.ts','b.ts'])); const c=new WorkspaceFreshnessCoordinator(100,100,5000,-1), s=session(); await c.reconcile(s,root,definition,[]);
  const a=deferred<any>(); scan.mockReturnValueOnce(a.promise); const old=c.reconcile(s,root,definition,[]); c.clear(root); a.resolve(result(['a.ts']));
  expect((await old).reason).toBe('SEMANTIC_FRESHNESS_SUPERSEDED'); expect(s.notify).not.toHaveBeenCalled(); expect(s.closeDeletedFile).not.toHaveBeenCalled();
 });
 it('clear during awaited bind stops later effects and cache commit',async()=>{
  const scan=vi.spyOn(scanner,'scanWorkspaceSources').mockResolvedValue(result([])); const c=new WorkspaceFreshnessCoordinator(100,100,5000,-1), s=session(); await c.reconcile(s,root,definition,[]);
  const bind=deferred<void>(); s.bindCreatedFile.mockImplementationOnce(()=>bind.promise); scan.mockResolvedValue(result(['a.ts','b.ts'])); const old=c.reconcile(s,root,definition,[]);
  await Promise.resolve(); await Promise.resolve(); expect(s.bindCreatedFile).toHaveBeenCalledTimes(1); c.clear(); bind.resolve(); expect((await old).reason).toBe('SEMANTIC_FRESHNESS_SUPERSEDED'); expect(s.bindCreatedFile).toHaveBeenCalledTimes(1);
  expect((await c.reconcile(s,root,definition,[])).state).toBe('baseline');
 });
 it('root-only clear preserves independent root ownership',async()=>{
  const scan=vi.spyOn(scanner,'scanWorkspaceSources').mockResolvedValue(result()); const c=new WorkspaceFreshnessCoordinator(), s=session(), other=path.resolve('runtime/tmp/generation-other');
  await c.reconcile(s,root,definition,[]); await c.reconcile(s,other,definition,[]); c.clear(root); await c.reconcile(s,other,definition,[]); expect(scan).toHaveBeenCalledTimes(2);
 });
 it('clear-all cannot reuse epoch after later owner creation',async()=>{
  const scan=vi.spyOn(scanner,'scanWorkspaceSources'); const a=deferred<any>(); scan.mockReturnValueOnce(a.promise).mockResolvedValue(result(['b.ts'])); const c=new WorkspaceFreshnessCoordinator(), s=session();
  const old=c.reconcile(s,root,definition,[]); c.clear(); await c.reconcile(s,root,definition,[]); a.resolve(result()); expect((await old).reason).toBe('SEMANTIC_FRESHNESS_SUPERSEDED');
 });
});
