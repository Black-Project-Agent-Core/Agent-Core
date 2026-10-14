import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import * as snapshotReader from '../src/verification/evidence-snapshot.js';
import * as evidencePolicy from '../src/security/evidence-capture-policy.js';
import { MemoryService } from '../src/memory/service.js';
import { LearningService } from '../src/learning/service.js';
import { parseCanonicalNote, serializeCanonicalNote } from '../src/memory/note-format.js';
import { captureMemoryProvenance, assessMemoryStaleness } from '../src/memory/provenance.js';
import { captureMemorySourceSnapshot, normalizeMemorySourceSnapshot } from '../src/memory/source-snapshot.js';
import { buildMemoryTransferPayload, planMemoryImport } from '../src/memory/transfer.js';
vi.mock('../src/tracker/activity-tracker.js', () => ({ activityTracker: {
  record: vi.fn(), recordOutcome: vi.fn(), captureFailure: vi.fn(), readFeatureOutcomes: () => [],
} }));
const roots: string[] = [];
async function fixture() {
  const parent = fileURLToPath(new URL('../runtime/tmp/', import.meta.url));
  await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, 'mrr-test-')); roots.push(root);
  const memoryRoot = path.join(root, 'memory'); await fs.mkdir(memoryRoot);
  await fs.writeFile(path.join(memoryRoot, '00-agent-core-memory.md'), '# Agent Core test foundation\n');
  const memory = await MemoryService.initialize(root, memoryRoot);
  const learning = await LearningService.initialize({ enabled: true, stateDir: path.join(root, 'learning'), reviewInterval: 10, curatorIntervalHours: 168 }, memory);
  return { root, memoryRoot, memory, learning };
}
afterEach(async () => { for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true }); });
const lesson = (patch: any = {}) => ({ kind: 'durable-fact', title: 'Procedure', content: 'Use the inspected project configuration.', verified: true, evidenceRefs: ['verification:fixture'], ...patch });
const git = (root: string, ...args: string[]) => execFileSync('git', ['-c', `safe.directory=${root.replaceAll('\\','/')}`, '-C', root, ...args], { encoding: 'utf8', windowsHide: true, timeout: 10000 }).trim();
describe('MRR scoped learning', () => {
  it('retains scope through review, reload and all ranking profiles', async () => {
    const { root, memoryRoot, learning } = await fixture();
    const first = await learning.review([lesson({ workspace: ' Agent-Core ' })]);
    expect(first.outcomes[0].status).toBe('captured'); const id = first.outcomes[0].id;
    const reopened = await MemoryService.initialize(root, memoryRoot);
    expect((await reopened.read(id!, false))?.provenance?.workspace).toBe('agent-core');
    for (const rankingProfile of ['legacy','bm25','fusion'] as const) {
      expect((await reopened.search('inspected project configuration', { workspace: 'agent-core', rankingProfile })).some(x => x.record.id === id)).toBe(true);
      expect((await reopened.search('inspected project configuration', { workspace: 'other-project', rankingProfile })).some(x => x.record.id === id)).toBe(false);
    }
  });
  it('does not deduplicate across workspaces or collapse global and scoped lessons', async () => {
    const { learning, memory } = await fixture();
    for (const workspace of [undefined, 'agent-core', 'other-project']) {
      expect((await learning.review([lesson({ workspace })])).outcomes[0].status).toBe('captured');
    }
    expect((await memory.list()).filter(x => !x.pinned)).toHaveLength(3);
    expect((await learning.review([lesson({ workspace: 'AGENT-CORE' })])).outcomes[0].status).toBe('duplicate');
  });
  it('preserves changed body, code case, and applicability even with the same title', async () => {
    const { learning } = await fixture();
    for (const patch of [{content:'Use tokenA.'},{content:'Use tokena.'},{content:'Use tokenA.',reuseCondition:'Only in staging.'}]) {
      expect((await learning.review([lesson({workspace:'agent-core',...patch})])).outcomes[0].status).toBe('captured');
    }
  });
});
describe('MRR source freshness and persistence', () => {
  it('retains byte snapshots through canonical note parsing', async () => {
    const { root, memory } = await fixture(); await fs.writeFile(path.join(root,'facts.md'),'value-A');
    const record = await memory.remember({content:'A source-grounded fixture.',provenance:{workspace:'agent-core',files:['facts.md']}});
    const stored = await memory.read(record.id,false);
    expect(stored?.provenance?.sourceSnapshot?.files[0].status).toBe('captured');
    expect(parseCanonicalNote(serializeCanonicalNote(record)).provenance?.sourceSnapshot).toBeDefined();
  });
  it('detects same-size changes to untracked bytes, not just HEAD changes', async () => {
    const { root, memory } = await fixture(); await fs.writeFile(path.join(root,'facts.md'),'value-A');
    const provenance = await captureMemoryProvenance(root,{workspace:' Agent-Core ',files:['facts.md']});
    const record = { ...await memory.remember({content:'Fixture.'}), provenance };
    expect((await assessMemoryStaleness(record,root)).status).toBe('current');
    await fs.writeFile(path.join(root,'facts.md'),'value-B');
    const result = await assessMemoryStaleness(record,root);
    expect(result.status).toBe('changed'); expect(result.basis).toBe('local-byte-snapshot');
    expect(result.changedFiles).toEqual(['facts.md']);
  });
  it('keeps unavailable evidence and mismatched repository identity explicit', async () => {
    const { root, memory } = await fixture(); await fs.writeFile(path.join(root,'facts.md'),'A');
    const provenance = await captureMemoryProvenance(root,{files:['facts.md','missing.md']});
    const record = { ...await memory.remember({content:'Fixture.'}), provenance };
    expect((await assessMemoryStaleness(record,root)).status).toBe('source-unavailable');
    provenance.identity = {kind:'git',repositoryId:'sha256:'+'0'.repeat(64),worktreeId:'sha256:'+'0'.repeat(64)};
    expect((await assessMemoryStaleness(record,root)).status).toBe('source-unavailable');
  });
  it('preserves snapshots across export/import and detaches the exported object', async () => {
    const {root,memory}=await fixture(); await fs.writeFile(path.join(root,'facts.md'),'value-A');
    const record={...await memory.remember({content:'Fixture.'}),provenance:await captureMemoryProvenance(root,{workspace:'agent-core',files:['facts.md']})};
    const payload=buildMemoryTransferPayload([record]); const original=structuredClone(record.provenance.sourceSnapshot);
    expect(planMemoryImport(payload,[]).recordsToCreate[0].provenance?.sourceSnapshot).toEqual(original);
    payload.records[0].provenance!.sourceSnapshot!.files[0].path='changed.md';
    expect(record.provenance.sourceSnapshot).toEqual(original);
    const changed=structuredClone(record); changed.provenance.sourceSnapshot!.observedAt='2020-01-01T00:00:00.000Z';
    expect(buildMemoryTransferPayload([changed]).records[0].importKey).not.toBe(buildMemoryTransferPayload([record]).records[0].importKey);
  });
  it('labels explicit commits as Git reference and refuses a file absent from that commit', async () => {
    const {root,memory}=await fixture(); git(root,'init','--quiet');
    await fs.writeFile(path.join(root,'tracked.md'),'before'); git(root,'add','--','tracked.md');
    git(root,'-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','--quiet','-m','fixture');
    const head=git(root,'rev-parse','HEAD');
    const provenance=await captureMemoryProvenance(root,{files:['tracked.md'],gitCommit:head});
    expect(provenance.sourceSnapshot).toBeUndefined();
    const record={...await memory.remember({content:'Fixture.'}),provenance};
    expect(await assessMemoryStaleness(record,root)).toMatchObject({status:'current',basis:'git-reference'});
    await fs.writeFile(path.join(root,'tracked.md'),'after!');
    expect((await assessMemoryStaleness(record,root)).status).toBe('changed');
    await fs.writeFile(path.join(root,'untracked.md'),'unknown baseline');
    record.provenance={...provenance,files:['untracked.md']};
    expect((await assessMemoryStaleness(record,root)).status).toBe('source-unavailable');
  });
});
describe('MRR snapshot boundaries', () => {
  it.each(['.env','secrets/key.txt','runtime/state.json','../outside.md','DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT/ref.md','credentials.json'])('does not read excluded source %s', async file => {
    const {root}=await fixture();
    expect((await captureMemorySourceSnapshot(root,[file])).files[0]).toMatchObject({status:'unavailable',reason:'excluded-path'});
  });
  it('respects metadata-only policy and declines oversized or binary inputs', async () => {
    const {root}=await fixture(); await fs.writeFile(path.join(root,'facts.md'),'A');
    await fs.writeFile(path.join(root,'.agent-core-evidence.json'),JSON.stringify({version:1,default:'metadata-only'}));
    expect((await captureMemorySourceSnapshot(root,['facts.md'])).files[0]).toMatchObject({status:'unavailable',reason:'evidence-policy'});
    await fs.rm(path.join(root,'.agent-core-evidence.json'));
    await fs.writeFile(path.join(root,'large.txt'),Buffer.alloc(2*1024*1024+1,65));
    await fs.writeFile(path.join(root,'binary.txt'),Buffer.from([0,1,2]));
    const result=await captureMemorySourceSnapshot(root,['large.txt','binary.txt']);
    expect(result.files.every(file=>file.status==='unavailable')).toBe(true);
  });
  it('rejects malformed snapshots and mismatched file sets', async () => {
    const {root}=await fixture(); await fs.writeFile(path.join(root,'facts.md'),'A');
    const snapshot=await captureMemorySourceSnapshot(root,['facts.md']);
    expect(()=>normalizeMemorySourceSnapshot(snapshot,['other.md'])).toThrow('FILE_SET_MISMATCH');
    expect(()=>normalizeMemorySourceSnapshot({...snapshot,files:[...snapshot.files,...snapshot.files]},['facts.md'])).toThrow('FILE_SET_MISMATCH');
    expect(()=>normalizeMemorySourceSnapshot({...snapshot,observedAt:'invalid'},['facts.md'])).toThrow('INVALID');
  });
});
it('captures a dirty Git working file and the source commit without global safe-directory edits', async () => {
  const {root,memory}=await fixture(); git(root,'init','--quiet');
  await fs.writeFile(path.join(root,'tracked.md'),'committed'); git(root,'add','--','tracked.md');
  git(root,'-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','--quiet','-m','fixture');
  await fs.writeFile(path.join(root,'tracked.md'),'dirty-now');
  const provenance=await captureMemoryProvenance(root,{files:['tracked.md']});
  expect(provenance.gitCommit).toBe(git(root,'rev-parse','HEAD'));
  const record={...await memory.remember({content:'Fixture.'}),provenance};
  expect(await assessMemoryStaleness(record,root)).toMatchObject({status:'current',basis:'local-byte-snapshot'});
  await fs.writeFile(path.join(root,'tracked.md'),'dirty-new');
  expect((await assessMemoryStaleness(record,root)).status).toBe('changed');
});
it('stops before evidence-policy lookup when the native path reader rejects an alias (unit seam)', async () => {
  const {root}=await fixture(); await fs.writeFile(path.join(root,'facts.md'),'fixture');
  // The observed E: filesystem refused real junction creation with EISDIR.
  // Exercise the rejection boundary without claiming an OS-level junction test.
  const native=vi.spyOn(snapshotReader,'assertEvidenceLocalPath').mockRejectedValueOnce(new Error('EVIDENCE_LINK_REFUSED'));
  const policy=vi.spyOn(evidencePolicy,'decideToolEvidenceCapture');
  try {
    expect((await captureMemorySourceSnapshot(root,['facts.md'])).files[0]).toMatchObject({status:'unavailable',reason:'unreadable-or-unsupported'});
    expect(policy).not.toHaveBeenCalled();
  } finally {native.mockRestore();policy.mockRestore();}
});
it('retains empty and Unicode text bytes and bounds file count', async () => {
  const {root}=await fixture(); await fs.writeFile(path.join(root,'empty.md'),''); await fs.writeFile(path.join(root,'unicode.md'),'pengetahuan 日本語');
  const snapshot=await captureMemorySourceSnapshot(root,['empty.md','unicode.md']);
  expect(snapshot.files[0]).toMatchObject({status:'captured',bytes:0});
  expect(snapshot.files[1]).toMatchObject({status:'captured',bytes:Buffer.byteLength('pengetahuan 日本語')});
  await expect(captureMemorySourceSnapshot(root,Array.from({length:65},(_,i)=>`f${i}.md`))).rejects.toThrow('FILE_LIMIT');
});
