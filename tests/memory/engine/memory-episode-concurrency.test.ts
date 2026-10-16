import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { MemoryService, initializeMemoryRoot } from '../../../src/memory/facade.js';
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); });
async function setup() { const dir = await mkdtemp(path.join(os.tmpdir(), 'memory-t3-concurrency-')); roots.push(dir); const service = await initializeMemoryRoot({ baseDir: dir, memoryRoot: dir, experience: { enabled: true } }); const scope = { workspaceKey: 'agent-core', taskId: 'task-race', controllerId: 'controller-A' }; return { dir, service, scope, A: service.controller(scope), B: service.controller({ ...scope, controllerId: 'controller-B', sessionId: 'new-session' }) }; }
const start = { startKey: 'start-race', goal: 'Continue the task across controllers', sourceRefs: [] };
const input = (episode: any, operationId: string, summary = 'Synthetic change') => ({ episodeId: episode.id, expectedRevision: episode.revision, operationId, event: { kind: 'observation', summary, sourceRefs: [], stateChanges: [] } });
test('concurrent identical starts create one episode and immutable first origin', async () => { const { A, B, dir } = await setup(); const [a, b] = await Promise.all([A.startEpisode(start), B.startEpisode(start)]); expect(a).toEqual(b); expect(await readdir(path.join(dir, 'state/episodes'))).toEqual([a.id]); expect(await readdir(path.join(dir, 'state/episodes', a.id, 'events'))).toHaveLength(1); });
test('two controllers CAS rejects stale writes and valid replay crosses controller sessions', async () => { const { A, B, dir } = await setup(); const header = await A.startEpisode(start); const results = await Promise.allSettled([A.appendEvent(input(header, 'write-A')), B.appendEvent(input(header, 'write-B'))]); expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1); expect(results.filter(r => r.status === 'rejected')[0].reason.message).toBe('MEMORY_REVISION_CONFLICT'); const winner = results[0].status === 'fulfilled' ? 'write-A' : 'write-B'; const result = await B.appendEvent(input(header, winner)); expect(result.duplicate).toBe(true); expect((await A.getTaskContext()).data.episode.revision).toBe(2); expect(await readdir(path.join(dir, 'state/episodes', header.id, 'events'))).toHaveLength(2); });
test('same operation ID different payload races never admit both', async () => { const { A, B } = await setup(); const header = await A.startEpisode(start); const results = await Promise.allSettled([A.appendEvent(input(header, 'shared-operation', 'first')), B.appendEvent(input(header, 'shared-operation', 'second'))]); expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1); expect(results.filter(r => r.status === 'rejected')[0].reason.message).toBe('MEMORY_OPERATION_CONFLICT'); expect((await A.getTaskContext()).data.episode.eventCount).toBe(2); });
test('task namespace distinguishes operation receipts without controller-derived identity', async () => { const { A, service, scope, dir } = await setup(); const other = service.controller({ ...scope, taskId: 'task-other' }); const [a, b] = await Promise.all([A.startEpisode(start), other.startEpisode(start)]); await Promise.all([A.appendEvent(input(a, 'same-id')), other.appendEvent(input(b, 'same-id'))]); expect(a.id).not.toBe(b.id); const receipts = await readdir(path.join(dir, 'state/operations')); expect(receipts).toHaveLength(4); for (const name of receipts) {
    const content = await readFile(path.join(dir, 'state/operations', name), 'utf8');
    expect(content).not.toContain('controller-A');
    expect(content).not.toContain('new-session');
} });
test('different concurrent start keys cannot create two unfinished episodes', async () => {
    const { A, B, dir } = await setup();
    const results = await Promise.allSettled([A.startEpisode(start), B.startEpisode({ ...start, startKey: 'different-start' })]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(r => r.status === 'rejected')[0].reason.message).toBe('MEMORY_REVISION_CONFLICT');
    expect(await readdir(path.join(dir, 'state/episodes'))).toHaveLength(1);
});
test('memory source scope changes between preflight and commit reject without publishing events', async () => {
    const { A, service, dir } = await setup();
    const { memorySemanticRevision } = await import('../../../src/memory/disclosure.js');
    const source = await service.remember({ content: 'Synthetic scoped input', provenance: { workspace: 'agent-core', files: [] } });
    const header = await A.startEpisode(start);
    const store = (service as any).store, original = store.transact.bind(store);
    let changed = false;
    store.transact = async (...args: any[]) => { if (!changed) {
        changed = true;
        await service.update(source.id, { provenance: { workspace: 'other-workspace', files: [] } });
    } return original(...args); };
    await expect(A.appendEvent({ ...input(header, 'scope-race'), event: { ...input(header, 'unused').event, sourceRefs: [{ kind: 'memory', id: source.id, revision: memorySemanticRevision(source) }] } })).rejects.toThrow('MEMORY_REVISION_CONFLICT');
    expect((await A.getTaskContext()).data.episode.eventCount).toBe(1);
    expect(await readdir(path.join(dir, 'state/episodes', header.id, 'events'))).toHaveLength(1);
});
test('forget between preflight and transaction rejects without event or new receipt', async () => {
    const { A, service, dir } = await setup();
    const { memorySemanticRevision } = await import('../../../src/memory/disclosure.js');
    const source = await service.remember({ content: 'Synthetic visibility input', provenance: { workspace: 'agent-core', files: [] } });
    const header = await A.startEpisode(start);
    const before = await readdir(path.join(dir, 'state/operations'));
    const store = (service as any).store, original = store.transact.bind(store);
    let changed = false;
    store.transact = async (...args: any[]) => { if (!changed) {
        changed = true;
        await service.lifecycle(source.id, 'race-forget', 'forget');
    } return original(...args); };
    await expect(A.appendEvent({ ...input(header, 'visibility-race'), event: { ...input(header, 'unused').event, sourceRefs: [{ kind: 'memory', id: source.id, revision: memorySemanticRevision(source) }] } })).rejects.toThrow('MEMORY_REVISION_CONFLICT');
    expect(await readdir(path.join(dir, 'state/operations'))).toEqual(before);
    expect((await A.getTaskContext()).data.episode.eventCount).toBe(1);
});
test('captured evidence changed while transaction starts is not published as original current bytes', async () => {
    const { A, service, dir } = await setup();
    const fs = await import('node:fs/promises');
    await fs.writeFile(path.join(dir, 'source.md'), 'original source');
    const before = await readdir(path.join(dir, 'archive/objects'));
    const store = (service as any).store, original = store.transact.bind(store);
    let changed = false;
    store.transact = async (...args: any[]) => { if (!changed) {
        changed = true;
        await fs.writeFile(path.join(dir, 'source.md'), 'changed source!');
    } return original(...args); };
    await expect(A.captureEvidence({ operationId: 'capture-source-race', source: { kind: 'workspace-file', relativePath: 'source.md' } })).rejects.toThrow('MEMORY_REVISION_CONFLICT');
    expect(await readdir(path.join(dir, 'archive/objects'))).toEqual(before);
    expect(await fs.readdir(path.join(dir, 'state/operations')).catch(error => error.code === 'ENOENT' ? [] : Promise.reject(error))).toEqual([]);
});
test('capture policy changed while transaction starts rejects before archive publication', async () => {
    const { A, service, dir } = await setup();
    const fs = await import('node:fs/promises');
    await fs.writeFile(path.join(dir, 'source.md'), 'allowed source');
    const before = await readdir(path.join(dir, 'archive/objects'));
    const store = (service as any).store, original = store.transact.bind(store);
    let changed = false;
    store.transact = async (...args: any[]) => { if (!changed) {
        changed = true;
        await fs.writeFile(path.join(dir, '.agent-core-evidence.json'), JSON.stringify({ version: 1, default: 'omit' }));
    } return original(...args); };
    await expect(A.captureEvidence({ operationId: 'capture-policy-race', source: { kind: 'workspace-file', relativePath: 'source.md' } })).rejects.toThrow('MEMORY_REVISION_CONFLICT');
    expect(await readdir(path.join(dir, 'archive/objects'))).toEqual(before);
});
test('activation root identity changed after preflight rejects durable namespace publication', async () => {
    const { A, service, dir } = await setup();
    const fs = await import('node:fs/promises');
    const file = path.join(dir, 'state/experience-manifest.json');
    const initial = JSON.parse(await readFile(file, 'utf8'));
    const store = (service as any).store, original = store.transact.bind(store);
    let changed = false;
    store.transact = async (...args: any[]) => { if (!changed) {
        changed = true;
        await fs.writeFile(file, JSON.stringify({ ...initial, rootId: 'other-root-identity', generation: 2 }));
    } return original(...args); };
    await expect(A.startEpisode(start)).rejects.toThrow('MEMORY_REVISION_CONFLICT');
    expect(await fs.readdir(path.join(dir, 'state/episodes')).catch(error => error.code === 'ENOENT' ? [] : Promise.reject(error))).toEqual([]);
});
test('activation parsed before source preparation remains the exact namespace dependency', async () => {
    const { A, service, dir } = await setup();
    const fs = await import('node:fs/promises');
    const file = path.join(dir, 'state/experience-manifest.json');
    const store = (service as any).store, load = store.loadAll.bind(store);
    let changed = false;
    store.loadAll = async () => { const loaded = await load(); if (!changed) {
        changed = true;
        const activation = JSON.parse(await readFile(file, 'utf8'));
        await fs.writeFile(file, JSON.stringify({ ...activation, generation: activation.generation + 1 }));
    } return loaded; };
    await expect(A.startEpisode(start)).rejects.toThrow('MEMORY_REVISION_CONFLICT');
    expect(await fs.readdir(path.join(dir, 'state/episodes')).catch(error => error.code === 'ENOENT' ? [] : Promise.reject(error))).toEqual([]);
});
async function childTask(dir: string, mode: string, value: unknown, boundary = 'none', controller = 'controller-child') {
    const { spawn } = await import('node:child_process');
    const child = spawn(process.execPath, [new URL('./helpers/memory-episode-child.mjs', import.meta.url).pathname, dir, mode, boundary, Buffer.from(JSON.stringify(value)).toString('base64url'), controller], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    const exit = new Promise<number | null>((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    const ready = boundary === 'none' ? exit : new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`Child timed out: ${stdout} ${stderr}`)); }, 15000);
        child.stdout.on('data', () => { if (stdout.includes('"boundary"')) {
            clearTimeout(timer);
            resolve();
        } });
        exit.then(code => { clearTimeout(timer); if (!stdout.includes('"boundary"'))
            reject(new Error(`No boundary: ${code} ${stdout} ${stderr}`)); });
    });
    await ready;
    return { child, exit, output: () => ({ stdout, stderr }) };
}
for (const boundary of ['preparing', 'prepared', 'apply', 'committed', 'response'])
    test(`episode child killed at ${boundary} recovers original state and safe replay`, async () => {
        const { A, dir, scope } = await setup();
        const header = await A.startEpisode(start), before = (await A.getTaskContext()).data.episodeRef;
        const value = { ...input(header, 'crash-operation'), event: { ...input(header, 'unused').event, stateChanges: [{ op: 'upsert', item: { id: 'pending-blocker', kind: 'blocker', text: 'Still blocked until checked', critical: true, state: 'active', sourceRefs: [], verification: { status: 'unverified', evidence: [] } } }, { op: 'upsert', item: { id: 'pending-next', kind: 'next-action', text: 'Run the next check', critical: true, state: 'active', sourceRefs: [], verification: { status: 'unverified', evidence: [] } } }] } };
        const child = await childTask(dir, 'appendEvent', value, boundary);
        child.child.kill('SIGKILL');
        await child.exit;
        const fs = await import('node:fs/promises'), expired = new Date(Date.now() - 180000);
        await fs.utimes(path.join(dir, '.memory.lock'), expired, expired).catch(error => { if (error.code !== 'ENOENT')
            throw error; });
        const restarted = await MemoryService.initialize(dir, dir);
        expect(restarted.health().canonicalStore).toBe('available');
        const B = restarted.controller({ ...scope, controllerId: 'controller-restarted' }), context = await B.getTaskContext();
        const committed = ['committed', 'response'].includes(boundary);
        expect(context.data.episode.eventCount).toBe(committed ? 2 : 1);
        expect(await readdir(path.join(dir, 'state/operations'))).toHaveLength(committed ? 2 : 1);
        expect(await readdir(path.join(dir, 'state/episodes', header.id, 'events'))).toHaveLength(committed ? 2 : 1);
        expect(await readdir(path.join(dir, 'archive/manifests'))).toHaveLength(committed ? 5 : 3);
        const original = await B.expand({ source: before, view: 'episode' });
        expect(JSON.parse(original.data.text).events).toHaveLength(1);
        const replay = await childTask(dir, 'appendEvent', value);
        expect(await replay.exit).toBe(0);
        expect(replay.output().stderr).toBe('');
        const result = JSON.parse(replay.output().stdout).result;
        expect(result.revision).toBe(2);
        expect(result.duplicate).toBe(committed);
        const again = await childTask(dir, 'appendEvent', value);
        expect(await again.exit).toBe(0);
        expect(JSON.parse(again.output().stdout).result).toEqual({ ...result, duplicate: true });
        const current = (await B.getTaskContext()).data.episodeRef, expanded = JSON.parse((await B.expand({ source: current, view: 'episode' })).data.text);
        expect(expanded.workingState.filter((item: any) => item.state === 'active').map((item: any) => item.kind)).toEqual(['goal', 'blocker', 'next-action']);
        expect(expanded.events[1].origin.controllerId).toBe('controller-child');
        expect(await readdir(path.join(dir, 'state/transactions'))).toEqual([]);
        expect(await readdir(path.join(dir, 'state/operations'))).toHaveLength(2);
    }, 20000);
test('two independent processes reject stale episode CAS and support controller-neutral replay', async () => {
    const { A, dir } = await setup();
    const header = await A.startEpisode(start);
    const children = await Promise.all([childTask(dir, 'appendEvent', input(header, 'process-A'), 'none', 'controller-process-A'), childTask(dir, 'appendEvent', input(header, 'process-B'), 'none', 'controller-process-B')]);
    const results = children.map(child => JSON.parse(child.output().stdout));
    expect(results.filter(value => value.result)).toHaveLength(1);
    expect(results.filter(value => value.error)[0].error).toBe('MEMORY_REVISION_CONFLICT');
    const winner = results[0].result ? 'process-A' : 'process-B', replay = await childTask(dir, 'appendEvent', input(header, winner), 'none', 'controller-process-C');
    expect(JSON.parse(replay.output().stdout).result.duplicate).toBe(true);
    expect((await A.getTaskContext()).data.episode.eventCount).toBe(2);
}, 20000);
test('live applying episode writer excludes task reads and preserves pending journal until recovery', async () => {
    const { A, dir, scope } = await setup();
    const header = await A.startEpisode(start);
    const child = await childTask(dir, 'appendEvent', input(header, 'live-operation'), 'apply');
    let settled = false;
    const reading = A.getTaskContext().then(result => { settled = true; return result; });
    await new Promise(resolve => setTimeout(resolve, 80));
    expect(settled).toBe(false);
    const journals = await readdir(path.join(dir, 'state/transactions'));
    expect(journals).toHaveLength(1);
    expect(JSON.parse(await readFile(path.join(dir, 'state/transactions', journals[0], 'journal.json'), 'utf8')).phase).toBe('applying');
    child.child.kill('SIGKILL');
    await child.exit;
    const fs = await import('node:fs/promises'), expired = new Date(Date.now() - 180000);
    await fs.utimes(path.join(dir, '.memory.lock'), expired, expired);
    expect((await reading).data.episode.eventCount).toBe(1);
    expect((await (await MemoryService.initialize(dir, dir)).controller(scope).getTaskContext()).data.episode.revision).toBe(1);
}, 20000);
test('old journal v1 still blocks episode mutation and preserves its evidence', async () => {
    const { A, dir } = await setup();
    const header = await A.startEpisode(start);
    const fs = await import('node:fs/promises');
    const folder = path.join(dir, 'state/transactions/legacy-journal'), journal = JSON.stringify({ version: 1, id: 'legacy-journal', phase: 'prepared', entries: [] });
    await fs.mkdir(folder, { recursive: true });
    await fs.writeFile(path.join(folder, 'journal.json'), journal);
    await expect(A.appendEvent(input(header, 'blocked-legacy'))).rejects.toThrow('MEMORY_TRANSACTION_RECOVERY_BLOCKED');
    expect(await readFile(path.join(folder, 'journal.json'), 'utf8')).toBe(journal);
    expect(await readdir(path.join(dir, 'state/episodes', header.id, 'events'))).toHaveLength(1);
});
test('narrow visibility transaction key cannot be written by any planner', async () => {
    const { service, dir } = await setup();
    const store = (service as any).store, bytes = await readFile(path.join(dir, 'state/feedback.json'), 'utf8');
    await expect(store.transact(['feedback.json'], (snapshot: any) => ({ records: snapshot.records, touchedIds: [], stateWrites: [{ key: 'feedback.json', content: '{"version":1,"records":[]}' }], result: null }))).rejects.toThrow('MEMORY_STATE_READ_ONLY');
    expect(await readFile(path.join(dir, 'state/feedback.json'), 'utf8')).toBe(bytes);
});

test('source change during canonical loading is rechecked inside the commit lock',async()=>{
  const {A,service,dir}=await setup();const fs=await import('node:fs/promises'),file=path.join(dir,'while-loading.md');await fs.writeFile(file,'original evidence');const store=(service as any).store,load=store.loadAll.bind(store);let calls=0;
  store.loadAll=async()=>{const loaded=await load();if(++calls===2)await fs.writeFile(file,'modified evidence');return loaded;};
  await expect(A.captureEvidence({operationId:'while-loading',source:{kind:'workspace-file',relativePath:'while-loading.md'}})).rejects.toThrow('MEMORY_REVISION_CONFLICT');expect(await readdir(path.join(dir,'archive/objects'))).toHaveLength(1);
});

test('capture identity drift from real file to symlink before commit cannot publish bytes',async()=>{
  const {A,service,dir}=await setup();const fs=await import('node:fs/promises'),file=path.join(dir,'before-alias.md'),other=path.join(dir,'replacement.md');await fs.writeFile(file,'original evidence');await fs.writeFile(other,'replacement evidence');const store=(service as any).store,transact=store.transact.bind(store);let changed=false;
  store.transact=async(...args:any[])=>{if(!changed){changed=true;await fs.rm(file);await fs.symlink(other,file);}return transact(...args);};
  await expect(A.captureEvidence({operationId:'alias-race',source:{kind:'workspace-file',relativePath:'before-alias.md'}})).rejects.toThrow('MEMORY_REVISION_CONFLICT');expect(await readdir(path.join(dir,'archive/objects'))).toHaveLength(1);
});

test('concurrent controller-neutral evidence capture writes one receipt manifest and byte object',async()=>{
  const {A,B,dir}=await setup();const value={operationId:'shared-capture',source:{kind:'controller-text',text:'Identical allowed capture'}};const results=await Promise.all([A.captureEvidence(value),B.captureEvidence(value)]);expect(results[0].source).toEqual(results[1].source);expect(results.map(result=>result.duplicate).sort()).toEqual([false,true]);expect(await readdir(path.join(dir,'archive/objects'))).toHaveLength(2);expect((await readdir(path.join(dir,'archive/manifests'))).filter(name=>name.startsWith('artifact-'))).toHaveLength(1);expect(await readdir(path.join(dir,'state/operations'))).toHaveLength(1);
});

test('source expiry between preparation and commit revalidates current visibility',async()=>{
  const {A,service,dir}=await setup();const {vi}=await import('vitest'),{memorySemanticRevision}=await import('../../../src/memory/disclosure.js');const now=Date.now();const source=await service.remember({content:'Source with a pending expiry',expiresAt:new Date(now+60000).toISOString(),provenance:{workspace:'agent-core',files:[]}});const header=await A.startEpisode(start);const store=(service as any).store,transact=store.transact.bind(store);let clock:any;
  store.transact=async(...args:any[])=>{clock??=vi.spyOn(Date,'now').mockReturnValue(now+120000);return transact(...args);};
  try{await expect(A.appendEvent({...input(header,'expiry-race'),event:{...input(header,'unused').event,sourceRefs:[{kind:'memory',id:source.id,revision:memorySemanticRevision(source)}]}})).rejects.toThrow('MEMORY_SOURCE_UNAVAILABLE');expect(await readdir(path.join(dir,'state/episodes',header.id,'events'))).toHaveLength(1);}finally{clock?.mockRestore();}
});

test('file fingerprints remain exact raw-byte SHA with valid UTF8 BOM CRLF NUL and invalid-byte substitution',async()=>{
  const {dir}=await setup();const fs=await import('node:fs/promises'),{createHash}=await import('node:crypto'),{fingerprintFile,fingerprintText}=await import('../../../src/memory/transaction.js');const file=path.join(dir,'fingerprint.bin'),text='\uFEFFExact �\r\n\0tail',valid=Buffer.from(text);await fs.writeFile(file,valid);expect(await fingerprintFile(file)).toBe(fingerprintText(text));const at=valid.indexOf(Buffer.from([0xef,0xbf,0xbd])),invalid=Buffer.concat([valid.subarray(0,at),Buffer.from([0xff]),valid.subarray(at+3)]);await fs.writeFile(file,invalid);expect(await fingerprintFile(file)).toBe(createHash('sha256').update(invalid).digest('hex'));expect(await fingerprintFile(file)).not.toBe(fingerprintText(text));
});

test('invalid raw substitution after artifact source preparation conflicts before event publication',async()=>{
  const {A,service,dir}=await setup();const fs=await import('node:fs/promises'),text='Frozen � source',receipt=await A.captureEvidence({operationId:'raw-race-source',source:{kind:'controller-text',text}}),manifest=JSON.parse(await readFile(path.join(dir,'archive/manifests',`artifact-${receipt.source.id}.json`),'utf8')),file=path.join(dir,'archive/objects',manifest.bodyDigest.slice(7)),original=await readFile(file),at=original.indexOf(Buffer.from([0xef,0xbf,0xbd])),corrupt=Buffer.concat([original.subarray(0,at),Buffer.from([0xff]),original.subarray(at+3)]);const header=await A.startEpisode(start),store=(service as any).store,transact=store.transact.bind(store);let changed=false;
  store.transact=async(...args:any[])=>{if(!changed){changed=true;await fs.writeFile(file,corrupt);}return transact(...args);};
  await expect(A.appendEvent({...input(header,'raw-race-event'),event:{...input(header,'unused').event,sourceRefs:[receipt.source]}})).rejects.toThrow('MEMORY_REVISION_CONFLICT');expect(await readdir(path.join(dir,'state/episodes',header.id,'events'))).toHaveLength(1);expect(await readdir(path.join(dir,'state/operations'))).toHaveLength(2);
});
