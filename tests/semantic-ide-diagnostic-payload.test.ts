import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/tracker/activity-tracker.js', () => ({ activityTracker: { record: vi.fn(), captureFailure: vi.fn() } }));
vi.mock('../src/semantic-ide/protocol.js', async load => {
  const actual: any = await load();
  return { ...actual, LspConnection: class {
    onNotification: any;
    constructor(...args: any[]) { this.onNotification = args[4]; }
    setContentModifiedRetryMethods() {}
    async close() {}
  } };
});
import { LanguageServerSession } from '../src/semantic-ide/language-server.js';
import { SemanticIdeService } from '../src/semantic-ide/service.js';
const root = path.resolve('runtime/tmp/diagnostic-shape-fixture');
const file = path.join(root, 'a.ts'); const uri = pathToFileURL(file).href;
const diagnostic = { message: 'a real error', range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }, severity: 1, data: { preserved: true } };
function session(id = 'generic') {
  const s: any = new LanguageServerSession({ id, extensions: ['.ts'], languageIds: { '.ts': 'typescript' }, command: process.execPath, args: [] }, root, 1);
  const publish = (payload: unknown) => s.connection.onNotification('textDocument/publishDiagnostics', payload);
  return { s, publish };
}
afterEach(() => vi.restoreAllMocks());
describe('S5 real notification acceptance and generation', () => {
  it.each([null, undefined, 'invalid', {}, [{ message: 'no range' }], [diagnostic, null]])('malformed diagnostics %j preserve accepted errors and generation', async payload => {
    const { s, publish } = session(); publish({ uri, diagnostics: [diagnostic] });
    const generation = s.diagnosticsGenerationFor(uri); publish({ uri, diagnostics: payload });
    expect(s.diagnosticsFor(uri)).toEqual([diagnostic]); expect(s.diagnosticsGenerationFor(uri)).toBe(generation);
    expect((await s.waitForDiagnosticsAfter(uri, generation, 1)).fresh).toBe(false);
    expect(s.capabilityIssues).toContain('SEMANTIC_DIAGNOSTIC_PAYLOAD_INVALID');
  });
  it.each([undefined, 42, {}])('invalid URI %j cannot throw or pollute the cache', value => {
    const { s, publish } = session();
    expect(() => publish({ uri: value, diagnostics: [] })).not.toThrow(); expect(s.diagnostics.size).toBe(0);
  });
  it('valid empty publication is genuinely fresh and clears prior errors', async () => {
    const { s, publish } = session(); publish({ uri, diagnostics: [diagnostic] });
    const generation = s.diagnosticsGenerationFor(uri); publish({ uri, diagnostics: [] });
    expect(await s.waitForDiagnosticsAfter(uri, generation, 10)).toMatchObject({ fresh: true, items: [] });
  });
  it('optional fields and inverted but structurally valid ranges remain intact', () => {
    const { s, publish } = session(); const item = { ...diagnostic, range: { start: { line: 2, character: 9 }, end: { line: 1, character: 0 } }, vendor: 'kept' };
    publish({ uri, diagnostics: [item] }); expect(s.diagnosticsFor(uri)).toEqual([item]);
  });
  it.each([-1, 0.5, '0', NaN])('invalid position %j cannot replace the previous snapshot', value => {
    const { s, publish } = session(); publish({ uri, diagnostics: [diagnostic] });
    publish({ uri, diagnostics: [{ ...diagnostic, range: { start: { line: value, character: 0 }, end: { line: 1, character: 0 } } }] });
    expect(s.diagnosticsFor(uri)).toEqual([diagnostic]);
  });
});
function consumer(options: { pull?: any; direct?: any; publication?: any; id?: string } = {}) {
  const { s, publish } = session(options.id ?? 'typescript'); publish({ uri, diagnostics: [diagnostic] });
  s.ensureDocument = async () => { if ('publication' in options) publish({ uri, diagnostics: options.publication }); return { uri, text: 'x' }; };
  s.request = vi.fn(async (method: string) => {
    if (method === 'textDocument/diagnostic') { if ('pull' in options) return options.pull; throw new Error('unsupported'); }
    return options.direct;
  });
  const service: any = new (SemanticIdeService as any)({ runtimeDir: path.join(root, '.runtime'), callTimeoutMs: 1 }, [], [], new Map());
  service.resolveFile = async () => file; service.definitionForFile = () => ({ languageId: 'typescript' });
  service.withRecovery = async (_: any, __: any, work: any) => work(s);
  const context = { root, folders: [{ name: 'fixture', root }] };
  return { service, context, read: () => service.diagnosticsForRelativePath(context, 'a.ts') };
}
describe('S5 real diagnostic consumers', () => {
  it.each([undefined, null, {}, { body: null }, { body: [{}] }, { body: [{ start: { line: -1, offset: 1 }, end: { line: 1, offset: 2 }, text: 'bad' }] }])('malformed direct response %j is stale, not fresh empty', async direct => {
    const h = consumer({ direct }); expect(await h.read()).toEqual({ items: [diagnostic], freshness: 'stale' });
  });
  it('valid direct body [] remains a fresh clean report', async () => {
    expect(await consumer({ direct: { body: [] } }).read()).toEqual({ items: [], freshness: 'typescript-direct' });
  });
  it('valid direct positions normalize from one-based coordinates', async () => {
    const r = await consumer({ direct: { body: [{ start: { line: 2, offset: 3 }, end: { line: 2, offset: 4 }, text: 'error', category: 'error' }] } }).read();
    expect(r.freshness).toBe('typescript-direct'); expect(r.items[0]).toMatchObject({ message: 'error', range: { start: { line: 1, character: 2 }, end: { line: 1, character: 3 } } });
  });
  it('invalid nonempty pull is not accepted as fresh', async () => {
    expect(await consumer({ pull: { items: [null] }, id: 'generic' }).read()).toEqual({ items: [diagnostic], freshness: 'stale' });
  });
  it('valid empty pull is accepted', async () => {
    expect(await consumer({ pull: { items: [] } }).read()).toEqual({ items: [], freshness: 'pull' });
  });
  it('invalid publication and direct response cannot establish resolved errors or completeness', async () => {
    const h = consumer({ publication: null, direct: { body: null } });
    const result = await h.service.collectDiagnosticsDelta(h.context, [{ before: 'a.ts', after: 'a.ts' }], new Map([['a.ts', { items: [diagnostic], freshness: 'pull' }]]));
    expect(result.complete).toBe(false); expect(result.files[0].resolvedCount).toBe(0); expect(result.files[0].freshness).toBe('stale');
  });
  it('valid clean after-report establishes one resolved error', async () => {
    const h = consumer({ pull: { items: [] } });
    const result = await h.service.collectDiagnosticsDelta(h.context, [{ before: 'a.ts', after: 'a.ts' }], new Map([['a.ts', { items: [diagnostic], freshness: 'pull' }]]));
    expect(result.complete).toBe(true); expect(result.files[0].resolvedCount).toBe(1);
  });
});
